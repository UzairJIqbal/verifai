// Runs the AI judge over a run's tries: one call per try that wrote a reply,
// asking only the criteria that apply to it. The pacing, limits and cache are
// in run-calls.ts, shared with the claim checker.
import type { LanguageModel } from "ai";
import type { JudgeConfig } from "../config";
import type { Clock } from "../eval/pacer";
import type { EvalStore } from "../eval/store";
import type { Background } from "../graders/hallucination";
import type { JudgeCheck, RecordedTrial } from "../results/schema";
import type { Task } from "../tasks/schema";
import type { JudgeSetup } from "./claims";
import { criteriaFor, judgeAnswerSchema, judgeCacheKey, judgeRequest, readJudgeAnswer, type JudgeRequest } from "./rubric";
import { callsToSend as jobsToSend, runJudgeCalls, type CallsProgress, type JudgeJob, type StopReason } from "./run-calls";

export type JudgeTryJob = JudgeJob & { input: string; request: JudgeRequest };

export type JudgePlan = {
  jobs: JudgeTryJob[];
  // Tries with no reply: nothing to judge, so no call and no verdict.
  noReplies: number;
  errored: number;
};

export function planJudge(store: EvalStore, setup: JudgeSetup, trials: RecordedTrial[], tasksById: Map<string, Pick<Task, "expected">>, background: Background): JudgePlan {
  let noReplies = 0;
  let errored = 0;
  const jobs = trials.flatMap((t): JudgeTryJob[] => {
    if (t.status === "errored") {
      errored++;
      return [];
    }
    const task = tasksById.get(t.taskId);
    if (task === undefined) throw new Error(`Task ${t.taskId} isn't in the tasks file any more, so which criteria apply to it can't be worked out.`);
    const criteria = criteriaFor(task, t.steps);
    if (criteria.length === 0) {
      noReplies++;
      return [];
    }
    const request = judgeRequest(t.steps, background, criteria);
    const key = judgeCacheKey(setup, request);
    return [{ taskId: t.taskId, tryNumber: t.tryNumber, request, input: request.input, key, cached: store.cacheGet(key) }];
  });
  return { jobs, noReplies, errored };
}

export const callsToSend = (plan: JudgePlan): number => jobsToSend(plan.jobs);

export type JudgeOutcome = {
  judgments: { taskId: string; tryNumber: number; judge: JudgeCheck }[];
  sent: number;
  // Answers replayed from before their tokens were saved: their cost isn't known.
  uncosted: number;
  // Null when every try was judged.
  stop: StopReason | null;
};

export async function runJudge(o: {
  store: EvalStore;
  plan: JudgePlan;
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
  onProgress: (p: CallsProgress) => void;
}): Promise<JudgeOutcome> {
  const { setup } = o;
  const out = await runJudgeCalls<JudgeTryJob, JudgeCheck>({
    ...o,
    jobs: o.plan.jobs,
    schema: judgeAnswerSchema,
    read: (text, job) => readJudgeAnswer(text, job.request, setup),
    isUngraded: (check) => check.status === "ungraded",
  });
  return { judgments: out.results.map(({ taskId, tryNumber, result, cost }) => ({ taskId, tryNumber, judge: cost === null ? result : { ...result, cost } })), sent: out.sent, uncosted: out.uncosted, stop: out.stop };
}
