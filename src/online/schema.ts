// What one batch of simulated traffic leaves in results/online/<batch>/: the
// record the online page reads. Browser-safe: no Node modules here.
import { z } from "zod";
import { REASONING_EFFORTS } from "../reasoning-effort";
import { claimCheckSchema, stepSchema, usageSchema, verdictSchema } from "../results/schema";
import { CATEGORIES, DIFFICULTIES } from "../tasks/schema";

export const ONLINE_FILES = { batch: "batch.json", conversations: "conversations.jsonl" } as const;

// How the customer comes across. Each has its words in the customer prompt file.
export const PERSONAS = ["patient", "angry", "vague", "pushy-refund"] as const;
export type Persona = (typeof PERSONAS)[number];

// How a conversation ended. The customer ends it with a tool call saying
// whether it got what it wanted; otherwise the turns ran out, or the agent
// hit its step limit without replying.
export const ONLINE_ENDS = ["goal-met", "gave-up", "turn-limit", "step-limit"] as const;
export type OnlineEnd = (typeof ONLINE_ENDS)[number];

const count = z.number().int().nonnegative();

export const conversationSchema = z.object({
  // 1, 2, … within the batch: the address of its page.
  number: z.number().int().positive(),
  // The dev task whose customer side gave the goal. Never a holdout task.
  templateId: z.string().min(1),
  category: z.enum(CATEGORIES),
  difficulty: z.enum(DIFFICULTIES),
  persona: z.enum(PERSONAS),
  status: z.enum(["finished", "errored"]),
  end: z.enum(ONLINE_ENDS).nullable(),
  // The customer's own one-line reason when it ended the chat.
  endReason: z.string().nullable(),
  error: z.string().nullable(),
  // Customer messages sent.
  turns: count,
  // Picked for grading. Only a sampled conversation has verdicts and claims.
  sampled: z.boolean(),
  verdicts: z.array(verdictSchema),
  // Null when it wasn't sampled, errored, or the claim checker stopped first.
  claims: claimCheckSchema.nullable(),
  // Why it went to the review queue; empty when it didn't.
  flags: z.array(z.string()),
  // The agent's model calls, and the customer's apart from them.
  calls: count,
  usage: usageSchema,
  customerCalls: count,
  customerUsage: usageSchema,
  costUsd: z.number().nonnegative(),
  startedAt: z.string(),
  finishedAt: z.string(),
  // The agent's side as in a try: customer messages, model calls, replies and tools.
  steps: z.array(stepSchema),
});
export type Conversation = z.infer<typeof conversationSchema>;

const rate = z.number().min(0).max(1);
// NaN never reaches the file: a rate with nothing to count is null.
const estimateSchema = z.object({ value: rate, lo: rate, hi: rate });

// One rate over the batch's sampled conversations: how many had it, out of
// how many it could be told for, with a 95% bootstrap interval.
export const rateSchema = z.object({ hits: count, of: count, estimate: estimateSchema.nullable() });
export type OnlineRate = z.infer<typeof rateSchema>;

export const ONLINE_RATES = ["hallucination", "policy", "toolErrors", "loops", "flagged"] as const;
export type OnlineRateName = (typeof ONLINE_RATES)[number];

export const batchRatesSchema = z.object({
  conversations: count,
  errored: count,
  sampled: count,
  // Sampled and not errored: what the rates are counted over.
  graded: count,
  // Graded conversations the claim checker didn't get to (it stopped).
  claimsMissing: count,
  // Graded conversations with at least one verdict or claim check that couldn't run.
  ungraded: count,
  rates: z.object({ hallucination: rateSchema, policy: rateSchema, toolErrors: rateSchema, loops: rateSchema, flagged: rateSchema }),
});
export type BatchRates = z.infer<typeof batchRatesSchema>;

export const batchSchema = z.object({
  batchId: z.string().min(1),
  createdAt: z.string(),
  finishedAt: z.string(),
  datasetVersion: z.string(),
  // The promoted version, or a candidate tried on purpose (never promoted by this).
  target: z.object({ kind: z.enum(["promoted", "candidate"]), name: z.string().min(1) }),
  agent: z.object({
    label: z.string(),
    model: z.string(),
    pool: z.array(z.string()),
    temperature: z.number(),
    maxSteps: z.number().int().positive(),
    reasoningEffort: z.enum(REASONING_EFFORTS),
  }),
  customer: z.object({ promptVersion: z.string(), temperature: z.number(), maxTurns: z.number().int().positive() }),
  judge: z.object({ model: z.string(), claimsPromptVersion: z.string() }),
  sampleShare: z.number(),
  hallucinationThreshold: z.number(),
  // Why the batch stopped short, or null when every conversation ran.
  stopped: z.string().nullable(),
  rates: batchRatesSchema,
  // The hallucination rate is over the threshold.
  alert: z.boolean(),
});
export type Batch = z.infer<typeof batchSchema>;
