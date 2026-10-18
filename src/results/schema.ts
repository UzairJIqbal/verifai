// What a run leaves in results/<run>/: the record the dashboard reads. The
// runner writes these shapes and the dashboard checks every line against them.
// Browser-safe: no Node modules here.
import { z } from "zod";
import { REASONING_EFFORTS } from "../reasoning-effort";
import { CATEGORIES, DIFFICULTIES, SPLITS } from "../tasks/schema";

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

// `step` and `ungraded` came with the trajectory graders; files written before
// them read as "about the whole try" and "graded".
export const verdictSchema = z.object({
  grader: z.string(),
  pass: z.boolean(),
  reason: z.string(),
  // The index into the try's steps the verdict points at.
  step: z.number().int().nonnegative().nullable().default(null),
  // Couldn't run on this try. Never a pass.
  ungraded: z.boolean().default(false),
  // The exact text the verdict is about, at the step it was written in.
  spans: z.array(z.object({ step: z.number().int().nonnegative(), text: z.string() })).default([]),
});
export type TrialVerdict = z.infer<typeof verdictSchema>;

export const CLAIM_LABELS = ["supported", "contradicted", "unsupported"] as const;
export type ClaimLabel = (typeof CLAIM_LABELS)[number];

// One claim from the agent's replies, as the claim checker labelled it.
// `step` is the reply it came from; `evidence` is what in the trajectory it
// was checked against, quoted or pointed at.
export const claimSchema = z.object({
  step: z.number().int().nonnegative(),
  text: z.string(),
  label: z.enum(CLAIM_LABELS),
  evidence: z.string(),
  reason: z.string(),
});
export type Claim = z.infer<typeof claimSchema>;

// What the claim checker made of one try. Ungraded when its answer couldn't
// be read: never counted as supported.
export const claimCheckSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("checked"), model: z.string(), promptVersion: z.string(), claims: z.array(claimSchema) }),
  z.object({ status: z.literal("ungraded"), model: z.string(), promptVersion: z.string(), reason: z.string() }),
]);
export type ClaimCheck = z.infer<typeof claimCheckSchema>;

// The criteria the AI judge marks, in the order they're shown. Only what code
// can't check: the rest is done by the graders.
export const JUDGE_CRITERIA = ["refusal-explained", "answered-question", "tone"] as const;
export type JudgeCriterion = (typeof JUDGE_CRITERIA)[number];

export const criterionVerdictSchema = z.object({ criterion: z.enum(JUDGE_CRITERIA), pass: z.boolean(), reason: z.string() });
export type CriterionVerdict = z.infer<typeof criterionVerdictSchema>;

// What the judge made of one try, against one rubric. `rubricVersion` is the
// file's version and a hash of its words ("v1 · 3f2a9c"), so an edit without
// a new version still shows as a different rubric. Only the criteria that
// applied to the try have a verdict. Ungraded when the answer couldn't be
// read: never a pass.
export const judgeCheckSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("judged"), model: z.string(), rubricVersion: z.string(), verdicts: z.array(criterionVerdictSchema) }),
  z.object({ status: z.literal("ungraded"), model: z.string(), rubricVersion: z.string(), reason: z.string() }),
]);
export type JudgeCheck = z.infer<typeof judgeCheckSchema>;

export const TRIAL_STATUSES = ["passed", "failed", "errored"] as const;
export type TrialStatus = (typeof TRIAL_STATUSES)[number];

// A try as the runner records it in the eval store.
export const recordedTrialSchema = z.object({
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
  // Null until `pnpm claims` has checked this try.
  claims: claimCheckSchema.nullable().default(null),
  // Null until `pnpm judge` has judged this try. Never part of its status.
  judge: judgeCheckSchema.nullable().default(null),
});
export type RecordedTrial = z.infer<typeof recordedTrialSchema>;

// A try as the results files keep it: the recorded try plus its task's
// difficulty, so the report can be split by it without the tasks file.
// `expectedTools` (the tools in the task's reference) is what tool precision
// and recall are counted against; files from before the trajectory graders
// don't have it.
export const trialSchema = recordedTrialSchema.extend({ difficulty: z.enum(DIFFICULTIES), expectedTools: z.array(z.string()).optional() });
export type Trial = z.infer<typeof trialSchema>;

// A holdout try as the results files show it until its version is promoted:
// whether it passed, and nothing that could be learned from.
export const sealedTrialSchema = z.object({
  taskId: z.string(),
  category: z.enum(CATEGORIES),
  difficulty: z.enum(DIFFICULTIES),
  tryNumber: z.number().int().positive(),
  status: z.enum(TRIAL_STATUSES),
  verdicts: z.array(z.object({ grader: z.string(), pass: z.boolean(), ungraded: z.boolean().default(false) })),
});
export type SealedTrial = z.infer<typeof sealedTrialSchema>;

const rate = z.number().min(0).max(1);
const estimateSchema = z.object({ value: rate, lo: rate, hi: rate });

// One slice of a run. passHat[k − 1] is pass^k and passAt[k − 1] is pass@k,
// each with its 95% bootstrap interval over tasks; pass^1 is the success rate.
const sliceSchema = z.object({ tasks: count, tries: count, passed: count, passHat: z.array(estimateSchema), passAt: z.array(estimateSchema) });

// Any average, not only a rate: tool calls per try can be above 1.
const meanSchema = z.object({ value: z.number(), lo: z.number(), hi: z.number() });

// One grader across a run. Tries are the ones that weren't errored; of those,
// `graded` is how many it could run on. The rate is its pass rate over graded
// tries, averaged over tasks, with a 95% interval; null if it graded none.
const graderRowSchema = z.object({ grader: z.string(), tasks: count, tries: count, graded: count, passed: count, ungraded: count, rate: estimateSchema.nullable() });
export type GraderRow = z.infer<typeof graderRowSchema>;

// One tool across a run. Precision: of the tries that called it, the share
// whose task needed it. Recall: of the tries whose task needed it, the share
// that called it. Null when there's nothing to divide by.
const toolRowSchema = z.object({
  tool: z.string(),
  tasks: count,
  tries: count,
  called: count,
  expected: count,
  both: count,
  precision: estimateSchema.nullable(),
  recall: estimateSchema.nullable(),
});
export type ToolRow = z.infer<typeof toolRowSchema>;

export const graderReportSchema = z.object({
  tasks: count,
  // Tries the graders ran on: every try that wasn't errored.
  tries: count,
  errored: count,
  graders: z.array(graderRowSchema),
  // A try breaks the policy when any rule fails on it. Counted over tries
  // where every rule could run.
  policy: z.object({ tasks: count, tries: count, violated: count, rate: estimateSchema.nullable() }),
  tools: z.array(toolRowSchema),
  efficiency: z.object({
    tasks: count,
    tries: count,
    // Tool calls per try, and the reference's, each averaged over tasks.
    toolCalls: meanSchema.nullable(),
    reference: meanSchema.nullable(),
    // Tries with a repeated identical call, over tries the loop grader ran on.
    loops: count,
    loopRate: estimateSchema.nullable(),
  }),
});
export type GraderReport = z.infer<typeof graderReportSchema>;

// A share of tries with something wrong, averaged over tasks with its interval.
const tryRateSchema = z.object({ tasks: count, tries: count, hits: count, rate: estimateSchema.nullable() });

// The four hallucination rates. The two code checks run on every try; the
// claim rates count only the tries the claim checker has read, and are null
// until it has read any.
export const hallucinationReportSchema = z.object({
  fabricatedEntity: tryRateSchema,
  fabricatedAction: tryRateSchema,
  claims: z
    .object({
      // Who read them, as "<model> · claims <prompt version>". More than one
      // only if the judge changed partway and `pnpm claims` hasn't caught up.
      judges: z.array(z.string()),
      // Tries checked, of the tries that could be (every try that wasn't errored).
      checkable: count,
      checked: count,
      ungraded: count,
      // Agent replies with at least one unsupported or contradicted claim,
      // over every reply in the checked tries, pooled over tasks.
      responses: z.object({ tasks: count, tries: count, replies: count, flagged: count, rate: estimateSchema.nullable() }),
      // Unsupported claims over every claim, pooled over tasks.
      claims: z.object({ tasks: count, tries: count, total: count, unsupported: count, contradicted: count, rate: estimateSchema.nullable() }),
    })
    .nullable(),
});
export type HallucinationReport = z.infer<typeof hallucinationReportSchema>;

// One judged criterion across a run: of the tries it applied to, how many
// passed, averaged over tasks with an interval.
const judgeRowSchema = z.object({ criterion: z.enum(JUDGE_CRITERIA), tasks: count, tries: count, passed: count, rate: estimateSchema.nullable() });
export type JudgeRow = z.infer<typeof judgeRowSchema>;

// The AI judge's verdicts, beside the success rate and never part of it.
// Null until `pnpm judge` has read any try of the run.
export const judgeReportSchema = z.object({
  // Who judged, as "<model> · rubric <version>". More than one only if the
  // rubric or model changed and `pnpm judge` hasn't caught up.
  judges: z.array(z.string()),
  // Tries that could be judged (not errored, with a reply), of them judged,
  // and those whose answer couldn't be read.
  judgeable: count,
  judged: count,
  ungraded: count,
  criteria: z.array(judgeRowSchema),
});
export type JudgeReport = z.infer<typeof judgeReportSchema>;

export const runStatsSchema = z.object({
  overall: sliceSchema,
  byCategory: z.partialRecord(z.enum(CATEGORIES), sliceSchema),
  byDifficulty: z.partialRecord(z.enum(DIFFICULTIES), sliceSchema),
});

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
  // Runs with the same key ran the same configuration: the same agent, the
  // same words in its prompt and tools, the same tasks and tries. The cache
  // setting isn't part of it.
  configKey: z.string(),
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
  // Null for a smoke run, which is never a score.
  stats: runStatsSchema.nullable(),
  // The trajectory graders, beside the success rate and never folded into
  // it. Null for a smoke run, and absent from runs graded before them.
  graders: graderReportSchema.nullable().default(null),
  // Null for a smoke run, and absent from runs graded before the checks.
  hallucination: hallucinationReportSchema.nullable().default(null),
  // Null for a smoke run and until `pnpm judge` has read the run.
  judge: judgeReportSchema.nullable().default(null),
});
export type Report = z.infer<typeof reportSchema>;

const noiseSliceSchema = z.object({ tasks: count, outcomes: count, flips: count, flipRate: rate, floor: z.number().nonnegative() });

// One run of the noise command: two runs of one configuration with the cache
// off, how often their outcomes differed, and the smallest change in success
// rate (as a fraction) that's bigger than that.
export const noiseFloorSchema = z.object({
  configKey: z.string(),
  measuredAt: z.string(),
  runs: z.tuple([z.string(), z.string()]),
  datasetVersion: z.string(),
  overall: noiseSliceSchema,
  byCategory: z.partialRecord(z.enum(CATEGORIES), noiseSliceSchema),
});
export type NoiseFloor = z.infer<typeof noiseFloorSchema>;

export const RESULT_FILES = { markdown: "report.md", json: "report.json", trials: "trials.jsonl" } as const;
// Every noise measurement, one per line, in results/ beside the runs.
export const NOISE_FLOORS_FILE = "noise-floors.jsonl";
