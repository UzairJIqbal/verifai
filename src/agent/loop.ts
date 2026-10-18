import { generateText, tool, type AssistantModelMessage, type LanguageModel, type ModelMessage, type ToolResultPart, type ToolSet } from "ai";
import { z } from "zod";
import { runTool, SHOP_TOOLS, type ToolContext, type ToolName, type ToolOutcome } from "./tools";
import { offeredTools, type AgentVersion, type ToolDescriptions } from "./versions";
import type { ReasoningEffort } from "../config";

export type ModelUsage = { inputTokens: number; cachedInputTokens: number; outputTokens: number };

export type AgentEvent =
  // One model call: what it cost and how long it took. Comes before the
  // step's text and tool calls. `cached` means it was replayed, not sent;
  // `provider` is the one that answered.
  | { type: "model"; step: number; provider: string; startedAt: number; latencyMs: number; usage: ModelUsage; cached: boolean }
  | { type: "text"; step: number; text: string }
  | { type: "tool-call"; step: number; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool-result"; step: number; toolCallId: string; toolName: string; outcome: ToolOutcome; startedAt: number; latencyMs: number };

// What one model call gave back, as plain JSON, so it can be saved and replayed.
export type ModelStep = {
  text: string;
  toolCalls: { toolCallId: string; toolName: string; input: unknown }[];
  assistantMessages: AssistantModelMessage[];
  usage: ModelUsage;
};

export type ToolSpec = { name: ToolName; description: string; inputSchema: unknown };

// Everything that decides what the model answers, apart from the model and
// temperature, which are fixed for a run.
export type ModelRequest = { instructions: string; messages: ModelMessage[]; tools: ToolSpec[] };

export type ModelCall = { result: ModelStep; provider: string; latencyMs: number; cached: boolean };

/**
 * Wraps every model call. The runner uses it to replay from the cache, keep
 * under the rate limits and wait out a busy provider; `send` makes the real
 * call to whichever model the wrapper picks (one provider of the pool). With a
 * wrapper the SDK doesn't retry on its own, so every retry is one the wrapper
 * chose and reported.
 */
export type CallWrapper = (request: ModelRequest, send: (model: LanguageModel) => Promise<ModelStep>) => Promise<ModelCall>;

export type AgentSetup = {
  // Used when there's no wrapper; a wrapper picks its own.
  model: LanguageModel;
  provider: string;
  temperature: number;
  maxSteps: number;
  stepTimeoutMs: number;
  reasoningEffort: ReasoningEffort;
  version: AgentVersion;
  wrapCall?: CallWrapper;
};

export type TurnResult = {
  stopReason: "replied" | "step-limit";
  steps: number;
  reply: string;
};

// Tools are given to the model without an `execute`, so the SDK can only
// describe them. Running them is the loop's job, below.
export function buildToolSet(descriptions: ToolDescriptions): ToolSet {
  return Object.fromEntries(
    offeredTools(descriptions).map((name) => [name, tool({ description: descriptions[name], inputSchema: SHOP_TOOLS[name].inputSchema })]),
  );
}

// The tools as the model sees them, in a form that can be hashed.
export function describeTools(descriptions: ToolDescriptions): ToolSpec[] {
  return offeredTools(descriptions).map((name) => ({
    name,
    description: descriptions[name] ?? "",
    inputSchema: z.toJSONSchema(SHOP_TOOLS[name].inputSchema),
  }));
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
  const toolSpecs = describeTools(setup.version.toolDescriptions);
  const offered = offeredTools(setup.version.toolDescriptions);

  // One model call. No stopWhen, so the SDK never runs a step of its own.
  const send = async (model: LanguageModel): Promise<ModelStep> => {
    const result = await generateText({
      model,
      instructions: setup.version.systemPrompt,
      messages,
      tools,
      temperature: setup.temperature,
      // The SDK's own setting; each provider maps it to its parameter.
      reasoning: setup.reasoningEffort,
      timeout: { stepMs: setup.stepTimeoutMs },
      ...(setup.wrapCall ? { maxRetries: 0 } : {}),
    });
    return {
      text: result.text,
      toolCalls: result.toolCalls.map((c) => ({ toolCallId: c.toolCallId, toolName: c.toolName, input: c.input })),
      // Keep only the model's own message. For a call it couldn't parse, the SDK
      // also writes a tool error; we drop that and answer every call ourselves,
      // so each tool result in the history is one we produced and reported.
      assistantMessages: result.responseMessages.filter((m): m is AssistantModelMessage => m.role === "assistant"),
      usage: {
        inputTokens: result.usage.inputTokens ?? 0,
        cachedInputTokens: result.usage.inputTokenDetails.cacheReadTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
      },
    };
  };

  const call = async (): Promise<ModelCall> => {
    if (setup.wrapCall) {
      return setup.wrapCall({ instructions: setup.version.systemPrompt, messages, tools: toolSpecs }, send);
    }
    const started = performance.now();
    const result = await send(setup.model);
    return { result, provider: setup.provider, latencyMs: Math.round(performance.now() - started), cached: false };
  };

  for (let step = 1; step <= setup.maxSteps; step++) {
    onWaiting(step);
    const startedAt = Date.now();
    const { result, provider, latencyMs, cached } = await call();
    onEvent({ type: "model", step, provider, startedAt, latencyMs, usage: result.usage, cached });

    messages.push(...result.assistantMessages);
    if (result.text.trim() !== "") onEvent({ type: "text", step, text: result.text });
    if (result.toolCalls.length === 0) return { stopReason: "replied", steps: step, reply: result.text };

    const results: ToolResultPart[] = [];
    for (const toolCall of result.toolCalls) {
      onEvent({ type: "tool-call", step, toolCallId: toolCall.toolCallId, toolName: toolCall.toolName, input: toolCall.input });
      const toolStarted = Date.now();
      const began = performance.now();
      const outcome = runTool(ctx, toolCall.toolName, toolCall.input, offered);
      const toolLatency = Math.round(performance.now() - began);
      onEvent({
        type: "tool-result",
        step,
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        outcome,
        startedAt: toolStarted,
        latencyMs: toolLatency,
      });
      results.push({
        type: "tool-result",
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        output: outcome.ok ? { type: "json", value: outcome.value } : { type: "error-text", value: outcome.error },
      });
    }
    messages.push({ role: "tool", content: results });
  }

  return { stopReason: "step-limit", steps: setup.maxSteps, reply: "" };
}
