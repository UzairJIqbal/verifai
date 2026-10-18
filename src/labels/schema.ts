// Your labels and what the judges said about the same trials, as the files
// under evals/labels/ keep them. Browser-safe: no Node modules here.
import { z } from "zod";
import { CLAIM_LABELS, claimCheckSchema, JUDGE_CRITERIA, judgeCheckSchema } from "../results/schema";

// judge-dev may be looked at while improving a judge; judge-test only ever
// gives the agreement numbers. The same idea as the dev and holdout tasks.
export const JUDGE_SPLITS = ["judge-dev", "judge-test"] as const;
export type JudgeSplit = (typeof JUDGE_SPLITS)[number];

const trialRef = { runId: z.string().min(1), taskId: z.string().min(1), tryNumber: z.number().int().positive() };
export type TrialRef = { runId: string; taskId: string; tryNumber: number };
export const trialKey = (t: TrialRef): string => `${t.runId}/${t.taskId}/${t.tryNumber}`;

// One trial you labelled: one line of labels.jsonl. `criteria` is every
// criterion the judge was asked on that trial; `claims` is every claim the
// claim checker split its replies into, in its order, with your label.
// `claimsPromptVersion` is the checker's version that split them, so a later
// version's claims are matched against these by their words.
export const labelSchema = z.object({
  ...trialRef,
  split: z.enum(JUDGE_SPLITS),
  rubricVersion: z.string().min(1),
  claimsPromptVersion: z.string().min(1),
  labelledAt: z.string().min(1),
  criteria: z.array(z.object({ criterion: z.enum(JUDGE_CRITERIA), pass: z.boolean() })),
  claims: z.array(z.object({ step: z.number().int().nonnegative(), text: z.string(), label: z.enum(CLAIM_LABELS) })),
});
export type Label = z.infer<typeof labelSchema>;

// What one judge said about one labelled trial, copied out of the results
// files before a rerun replaces it: what lets the report show a judge's
// agreement before and after a change, on the same trials.
export const judgeSnapshotSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("judge"), ...trialRef, recordedAt: z.string(), check: judgeCheckSchema }),
  z.object({ kind: z.literal("claims"), ...trialRef, recordedAt: z.string(), check: claimCheckSchema }),
]);
export type JudgeSnapshot = z.infer<typeof judgeSnapshotSchema>;

// The bar for "acceptable", written down before any tuning.
export const barSchema = z.object({ minKappa: z.number().min(-1).max(1), reason: z.string().trim().min(1), decidedAt: z.string().min(1) });
export type Bar = z.infer<typeof barSchema>;

export const BIAS_CHECKS = ["order", "padding"] as const;
export type BiasCheck = (typeof BIAS_CHECKS)[number];

// One run of a bias check: the judge's verdicts on the same trials, as it
// normally sees them and changed in one harmless way. `changes` lists every
// verdict that moved.
export const biasResultSchema = z.object({
  check: z.enum(BIAS_CHECKS),
  judge: z.string(),
  ranAt: z.string(),
  description: z.string(),
  trials: z.number().int().nonnegative(),
  tasks: z.number().int().nonnegative(),
  // Trials whose changed version couldn't be graded: counted apart, never as "unchanged".
  ungraded: z.number().int().nonnegative(),
  verdicts: z.number().int().nonnegative(),
  changed: z.number().int().nonnegative(),
  byCriterion: z.array(z.object({ criterion: z.enum(JUDGE_CRITERIA), verdicts: z.number().int().nonnegative(), changed: z.number().int().nonnegative(), passToFail: z.number().int().nonnegative(), failToPass: z.number().int().nonnegative() })),
  changes: z.array(z.object({ ...trialRef, criterion: z.enum(JUDGE_CRITERIA), before: z.boolean(), after: z.boolean() })),
});
export type BiasResult = z.infer<typeof biasResultSchema>;
