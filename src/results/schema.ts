// What a run leaves in results/<run>/: the record the dashboard reads. The
// runner writes these shapes and the dashboard checks every line against them.
// Browser-safe: no Node modules here.
import { z } from "zod";
import { REASONING_EFFORTS } from "../reasoning-effort";
import { CATEGORIES, SPLITS } from "../tasks/schema";

const count = z.number().int().nonnegative();
const toolOutcome = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: z.json() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export const usageSchema = z.object({ inputTokens: count, cachedInputTokens: count, outputTokens: count });

// One recorded step of a try, in the order it happened. `step` counts model
// calls within one customer turn, the same as the playground shows.
export const stepSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("customer"), text: z.string() }),
  z.object({
    type: z.literal("model"),
    step: z.number().int(),
    // Which provider in the pool answered.
    provider: z.string(),
    startedAt: z.number(),
    latencyMs: count,
    usage: usageSchema,
    // Replayed from the response cache rather than sent. Tokens, cost and
    // latency are those of the original call.
    cached: z.boolean(),
    costUsd: z.number().nonnegative(),
  }),
  z.object({ type: z.literal("text"), step: z.number().int(), text: z.string() }),
  z.object({ type: z.literal("tool-call"), step: z.number().int(), toolCallId: z.string(), toolName: z.string(), input: z.json() }),
  z.object({
    type: z.literal("tool-result"),
    step: z.number().int(),
    toolCallId: z.string(),
    toolName: z.string(),
    outcome: toolOutcome,
    startedAt: z.number(),
    latencyMs: count,
  }),
]);
export type Step = z.infer<typeof stepSchema>;

export const verdictSchema = z.object({ grader: z.string(), pass: z.boolean(), reason: z.string() });

export const TRIAL_STATUSES = ["passed", "failed", "errored"] as const;
export type TrialStatus = (typeof TRIAL_STATUSES)[number];

export const trialSchema = z.object({
  taskId: z.string(),
  category: z.enum(CATEGORIES),
  tryNumber: z.number().int().positive(),
  // Errored means the try couldn't finish (network, bad model output). It is
  // never a pass, and its verdicts are empty.
  status: z.enum(TRIAL_STATUSES),
  end: z.enum(["answered", "out-of-replies", "step-limit"]).nullable(),
  error: z.string().nullable(),
  verdicts: z.array(verdictSchema),
  calls: count,
  cachedCalls: count,
  usage: usageSchema,
  costUsd: z.number().nonnegative(),
  modelLatencyMs: count,
  startedAt: z.string(),
  finishedAt: z.string(),
  traceUrl: z.string().nullable(),
  steps: z.array(stepSchema),
});
export type Trial = z.infer<typeof trialSchema>;

// A holdout try as the results files show it until its version is promoted:
// whether it passed, and nothing that could be learned from.
export const sealedTrialSchema = z.object({
  taskId: z.string(),
  category: z.enum(CATEGORIES),
  tryNumber: z.number().int().positive(),
  status: z.enum(TRIAL_STATUSES),
  verdicts: z.array(z.object({ grader: z.string(), pass: z.boolean() })),
});
export type SealedTrial = z.infer<typeof sealedTrialSchema>;

export const reportSchema = z.object({
  runId: z.string(),
  createdAt: z.string(),
  finishedAt: z.string(),
  split: z.enum(SPLITS),
  // A smoke run checks the machinery; its pass count is never a score, a
  // comparison or a gate.
  smoke: z.boolean(),
  datasetVersion: z.string(),
  taskCount: count,
  triesPerTask: z.number().int().positive(),
  useCache: z.boolean(),
  agent: z.object({
    // The providers the run could use, in the order it tried them.
    pool: z.array(z.string()).min(1),
    model: z.string(),
    temperature: z.number(),
    maxSteps: z.number().int(),
    reasoningEffort: z.enum(REASONING_EFFORTS),
    promptVersion: z.string(),
    toolDescriptionsVersion: z.string(),
  }),
  totals: z.object({
    trials: count,
    passed: count,
    failed: count,
    errored: count,
    calls: count,
    cachedCalls: count,
    // Model calls answered by each provider, replayed ones included.
    callsByProvider: z.record(z.string(), count),
    usage: usageSchema,
    costUsd: z.number().nonnegative(),
  }),
});
export type Report = z.infer<typeof reportSchema>;

export const RESULT_FILES = { markdown: "report.md", json: "report.json", trials: "trials.jsonl" } as const;
