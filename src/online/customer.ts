// The simulated customer. It's given its persona and a goal, and sees only
// what the agent wrote back: never the agent's prompt, its tools, what they
// returned, or what the task expected.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateText, tool, type LanguageModel, type ModelMessage } from "ai";
import { z } from "zod";
import { PROJECT_ROOT, type ReasoningEffort } from "../config";
import type { ModelUsage } from "../agent/loop";
import type { Task } from "../tasks/schema";
import { PERSONAS, type Persona } from "./schema";

export type CustomerPrompt = { version: string; instructions: string; opener: string; personas: Record<Persona, string> };

const PLACEHOLDERS = ["{{goal}}", "{{persona}}", "{{maxTurns}}"] as const;

// The file is sections under "## " headings: the instructions, the opener
// (the one line the customer is shown before it writes first) and one per persona.
export function parseCustomerPrompt(text: string, version: string): CustomerPrompt {
  const where = `online/customer/${version}.md`;
  const sections = new Map<string, string>();
  for (const part of text.split(/^## /m).slice(1)) {
    const newline = part.indexOf("\n");
    const heading = (newline === -1 ? part : part.slice(0, newline)).trim();
    if (sections.has(heading)) throw new Error(`${where} has the section "${heading}" twice.`);
    sections.set(heading, newline === -1 ? "" : part.slice(newline + 1).trim());
  }
  const section = (heading: string): string => {
    const body = sections.get(heading);
    if (!body) throw new Error(`${where} needs a "## ${heading}" section with text under it.`);
    return body;
  };
  const instructions = section("instructions");
  for (const p of PLACEHOLDERS) if (!instructions.includes(p)) throw new Error(`${where}: the instructions are missing the ${p} placeholder.`);
  const personas = Object.fromEntries(PERSONAS.map((p) => [p, section(`persona: ${p}`)]));
  return { version, instructions, opener: section("opener"), personas: z.record(z.enum(PERSONAS), z.string()).parse(personas) };
}

export function loadCustomerPrompt(version: string): CustomerPrompt {
  let text: string;
  try {
    text = readFileSync(join(PROJECT_ROOT, "online", "customer", `${version}.md`), "utf8");
  } catch {
    throw new Error(`Couldn't read online/customer/${version}.md. Check online.customerPromptVersion in verifai.config.json.`);
  }
  return parseCustomerPrompt(text, version);
}

// The customer's side of a dev task: what it says first and what it answers
// later. Only that: the task's note, expected outcome and reference calls
// would tell the customer what the agent should do.
export function customerGoal(task: Pick<Task, "first_message" | "canned_replies">): string {
  const lines = [`You opened the chat about this. Say it in your own words: "${task.first_message}"`];
  if (task.canned_replies.length > 0) {
    lines.push("When the agent asks, these are your answers, in this order:", ...task.canned_replies.map((r) => `- "${r}"`));
  }
  return lines.join("\n");
}

export function customerInstructions(prompt: CustomerPrompt, persona: Persona, goal: string, maxTurns: number): string {
  return prompt.instructions.replaceAll("{{goal}}", goal).replaceAll("{{persona}}", prompt.personas[persona]).replaceAll("{{maxTurns}}", String(maxTurns));
}

// One exchange so far: what the customer wrote and the agent's reply to it.
export type Exchange = { customer: string; agent: string };

// The chat from the customer's side: the agent's replies are what it's told,
// its own messages are what it said. Nothing else of the agent's turn.
export function customerView(opener: string, exchanges: Exchange[]): ModelMessage[] {
  const messages: ModelMessage[] = [{ role: "user", content: opener }];
  for (const e of exchanges) {
    messages.push({ role: "assistant", content: e.customer });
    messages.push({ role: "user", content: e.agent.trim() === "" ? "(The agent sent nothing.)" : e.agent });
  }
  return messages;
}

export const END_TOOL = "end_conversation";
const endInput = z.object({ outcome: z.enum(["goal-met", "gave-up"]), reason: z.string().trim().min(1) });

const endTool = {
  [END_TOOL]: tool({
    description: 'End the chat. outcome is "goal-met" when the agent did what you wanted, "gave-up" when it won\'t or can\'t. reason is one short line.',
    inputSchema: endInput,
  }),
};

export type CustomerReply =
  | { kind: "message"; text: string }
  | { kind: "end"; outcome: "goal-met" | "gave-up"; reason: string }
  // Nothing usable: no message and no valid end. The conversation errors.
  | { kind: "invalid"; why: string };

// An end call wins over any text beside it: the customer was told not to do both.
export function readCustomerReply(text: string, toolCalls: { toolName: string; input: unknown }[]): CustomerReply {
  const end = toolCalls.find((c) => c.toolName === END_TOOL);
  if (end) {
    const parsed = endInput.safeParse(end.input);
    return parsed.success ? { kind: "end", ...parsed.data } : { kind: "invalid", why: `it called ${END_TOOL} with ${JSON.stringify(end.input)}` };
  }
  if (toolCalls.length > 0) return { kind: "invalid", why: `it called ${toolCalls[0].toolName}, a tool it doesn't have` };
  if (text.trim() === "") return { kind: "invalid", why: "it wrote nothing" };
  return { kind: "message", text: text.trim() };
}

export type CustomerStep = { reply: CustomerReply; usage: ModelUsage };

export type CustomerSettings = { temperature: number; reasoningEffort: ReasoningEffort; stepTimeoutMs: number };

// One customer message (or its end of the chat). No retries of the SDK's own:
// the pool caller decides every retry.
export async function sendCustomer(model: LanguageModel, request: { instructions: string; messages: ModelMessage[] }, settings: CustomerSettings): Promise<CustomerStep> {
  const result = await generateText({
    model,
    instructions: request.instructions,
    messages: request.messages,
    tools: endTool,
    temperature: settings.temperature,
    reasoning: settings.reasoningEffort,
    timeout: { stepMs: settings.stepTimeoutMs },
    maxRetries: 0,
  });
  return {
    reply: readCustomerReply(result.text, result.toolCalls.map((c) => ({ toolName: c.toolName, input: c.input }))),
    usage: {
      inputTokens: result.usage.inputTokens ?? 0,
      cachedInputTokens: result.usage.inputTokenDetails.cacheReadTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
    },
  };
}
