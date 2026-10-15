// The response cache: one saved answer per model request. Repeating a run
// replays it for free, and a resumed try replays the calls it already made.
import { createHash } from "node:crypto";
import { assistantModelMessageSchema } from "ai";
import { z } from "zod";
import { canonical } from "../canonical";
import type { ModelRequest, ModelStep } from "../agent/loop";
import type { ReasoningEffort } from "../config";

// The provider isn't part of the key: the pool is one model, so an answer
// from any provider replays for all of them. The replay keeps which provider
// gave it.
export type CacheKeyParts = {
  model: string;
  temperature: number;
  reasoningEffort: ReasoningEffort;
  request: ModelRequest;
  // Part of the key so the 4 tries of a task stay independent of each other
  // (each gets its own answers), while rerunning try 3 gives back try 3.
  tryNumber: number;
};

export function cacheKey(parts: CacheKeyParts): string {
  return createHash("sha256").update(canonical(parts)).digest("hex");
}

const count = z.number().int().nonnegative();

const cachedCallSchema = z.object({
  text: z.string(),
  toolCalls: z.array(z.object({ toolCallId: z.string(), toolName: z.string(), input: z.unknown() })),
  assistantMessages: z.array(assistantModelMessageSchema),
  provider: z.string(),
  usage: z.object({ inputTokens: count, cachedInputTokens: count, outputTokens: count }),
  latencyMs: count,
});

export type CachedCall = { result: ModelStep; provider: string; latencyMs: number };

export function encodeCachedCall(call: CachedCall): string {
  return JSON.stringify({ ...call.result, provider: call.provider, latencyMs: call.latencyMs });
}

// A row that no longer parses (written by older code) counts as a miss.
export function decodeCachedCall(json: string): CachedCall | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  const parsed = cachedCallSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { latencyMs, provider, ...result } = parsed.data;
  return { result, provider, latencyMs };
}
