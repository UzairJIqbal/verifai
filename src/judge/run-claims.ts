// Runs the claim checker over a run's tries: one judge call per try. The
// pacing, limits and cache are in run-calls.ts, shared with the AI judge.
import type { LanguageModel } from "ai";
import type { JudgeConfig } from "../config";
import type { Clock } from "../eval/pacer";
import type { EvalStore } from "../eval/store";
import type { Background } from "../graders/hallucination";
import type { ClaimCheck, RecordedTrial } from "../results/schema";
import { claimsAnswerSchema, claimsCacheKey, claimsRequest, readClaimsAnswer, type ClaimsRequest, type JudgeSetup } from "./claims";
import { callsToSend as jobsToSend, runJudgeCalls, type CallsProgress, type JudgeJob, type StopReason } from "./run-calls";

export type ClaimsJob = JudgeJob & { request: ClaimsRequest };

export type ClaimsPlan = {
  jobs: ClaimsJob[];
  // Tries with no reply to check: done without a call.
  noReplies: number;
  errored: number;
};

// What a run still needs: every try that wasn't errored, with its cached
// answer if there is one. Calls to send = jobs without one.
export function planClaims(store: EvalStore, setup: JudgeSetup, trials: RecordedTrial[], background: Background): ClaimsPlan {
  let noReplies = 0;
  let errored = 0;
  const jobs = trials.flatMap((t): ClaimsJob[] => {
    if (t.status === "errored") {
      errored++;
      return [];
    }
    const request = claimsRequest(t.steps, background);
    const hasReply = request.replySteps.length > 0;
    if (!hasReply) noReplies++;
    const key = claimsCacheKey(setup, request);
    return [{ taskId: t.taskId, tryNumber: t.tryNumber, request, input: hasReply ? request.input : null, key, cached: store.cacheGet(key) }];
  });
  return { jobs, noReplies, errored };
}

export const callsToSend = (plan: ClaimsPlan): number => jobsToSend(plan.jobs);

export type ClaimsProgress = CallsProgress;

export type ClaimsOutcome = {
  checks: { taskId: string; tryNumber: number; claims: ClaimCheck }[];
  sent: number;
  // Answers replayed from before their tokens were saved: their cost isn't known.
  uncosted: number;
  // Null when every try was checked.
  stop: StopReason | null;
};

export async function runClaims(o: {
  store: EvalStore;
  plan: ClaimsPlan;
  judge: JudgeConfig;
  setup: JudgeSetup;
  // Null when nothing needs sending (every answer cached): no key needed.
  model: LanguageModel | null;
  clock: Clock;
  // Calls already sent to the judge in the last 24 hours, by our own count.
  sentToday: number;
  describeError: (error: unknown) => string;
  stopRequested: () => boolean;
  onNotice: (message: string) => void;
  onProgress: (p: ClaimsProgress) => void;
}): Promise<ClaimsOutcome> {
  const { setup } = o;
  const out = await runJudgeCalls<ClaimsJob, ClaimCheck>({
    ...o,
    jobs: o.plan.jobs,
    schema: claimsAnswerSchema,
    noCall: () => ({ status: "checked", model: setup.model, promptVersion: setup.promptVersion, claims: [] }),
    read: (text, job) => readClaimsAnswer(text, job.request, setup),
    isUngraded: (claims) => claims.status === "ungraded",
  });
  return { checks: out.results.map(({ taskId, tryNumber, result, cost }) => ({ taskId, tryNumber, claims: cost === null ? result : { ...result, cost } })), sent: out.sent, uncosted: out.uncosted, stop: out.stop };
}
