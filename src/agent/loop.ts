import { generateText, tool, type LanguageModel, type ModelMessage, type ToolResultPart, type ToolSet } from "ai";
import { runTool, SHOP_TOOLS, TOOL_NAMES, type ToolContext, type ToolName, type ToolOutcome } from "./tools";
import type { AgentVersion } from "./versions";

export type AgentEvent =
  | { type: "text"; step: number; text: string }
  | { type: "tool-call"; step: number; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool-result"; step: number; toolCallId: string; toolName: string; outcome: ToolOutcome };

export type AgentSetup = {
  model: LanguageModel;
  temperature: number;
  maxSteps: number;
  stepTimeoutMs: number;
  version: AgentVersion;
};

export type TurnResult = {
  stopReason: "replied" | "step-limit";
  steps: number;
  reply: string;
};

// Tools are given to the model without an `execute`, so the SDK can only
// describe them. Running them is the loop's job, below.
export function buildToolSet(descriptions: Record<ToolName, string>): ToolSet {
  return Object.fromEntries(
    TOOL_NAMES.map((name) => [name, tool({ description: descriptions[name], inputSchema: SHOP_TOOLS[name].inputSchema })]),
  );
}

/**
 * Answers one customer message. Each step is one model call; any tools it asks
 * for are run here and their results added, then the next step starts. Stops
 * when the model replies without a tool call, or after `maxSteps` steps.
 *
 * `messages` is the whole conversation so far, ending with the customer's
 * message, and is extended in place with everything this turn adds.
 */
export async function runAgentTurn(
  setup: AgentSetup,
  ctx: ToolContext,
  messages: ModelMessage[],
  onEvent: (event: AgentEvent) => void,
  onWaiting: (step: number) => void = () => {},
): Promise<TurnResult> {
  const tools = buildToolSet(setup.version.toolDescriptions);

  for (let step = 1; step <= setup.maxSteps; step++) {
    onWaiting(step);
    // One model call. No stopWhen, so the SDK never runs a step of its own.
    const result = await generateText({
      model: setup.model,
      instructions: setup.version.systemPrompt,
      messages,
      tools,
      temperature: setup.temperature,
      timeout: { stepMs: setup.stepTimeoutMs },
    });

    // Keep only the model's own message. For a call it couldn't parse, the SDK
    // also writes a tool error; we drop that and answer every call ourselves,
    // so each tool result in the history is one we produced and reported.
    messages.push(...result.responseMessages.filter((message) => message.role === "assistant"));

    if (result.text.trim() !== "") onEvent({ type: "text", step, text: result.text });
    if (result.toolCalls.length === 0) return { stopReason: "replied", steps: step, reply: result.text };

    const results: ToolResultPart[] = [];
    for (const call of result.toolCalls) {
      onEvent({ type: "tool-call", step, toolCallId: call.toolCallId, toolName: call.toolName, input: call.input });
      const outcome = runTool(ctx, call.toolName, call.input);
      onEvent({ type: "tool-result", step, toolCallId: call.toolCallId, toolName: call.toolName, outcome });
      results.push({
        type: "tool-result",
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        output: outcome.ok ? { type: "json", value: outcome.value } : { type: "error-text", value: outcome.error },
      });
    }
    messages.push({ role: "tool", content: results });
  }

  return { stopReason: "step-limit", steps: setup.maxSteps, reply: "" };
}
