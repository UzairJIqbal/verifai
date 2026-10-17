// Runs the claim checker over a run's tries: one judge call per try, one at a
// time, under the judge's per-minute and per-day limits. Every answer goes
// through the cache, so checking the same tries again sends nothing.
import { generateText, NoObjectGeneratedError, Output, type LanguageModel } from "ai";
import type { JudgeConfig } from "../config";
import type { Clock } from "../eval/pacer";
import { BUSY_RETRIES, busyWaitMs, classifyFailure } from "../eval/provider-errors";
import type { EvalStore } from "../eval/store";
import type { Background } from "../graders/hallucination";
import type { ClaimCheck, RecordedTrial } from "../results/schema";
import { judgeProviderOptions } from "./model";
import { claimsAnswerSchema, claimsCacheKey, claimsRequest, readClaimsAnswer, type ClaimsRequest, type JudgeSetup } from "./claims";

export type ClaimsJob = { taskId: string; tryNumber: number; request: ClaimsRequest; key: string; cached: string | null };

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
    if (request.replySteps.length === 0) noReplies++;
    const key = claimsCacheKey(setup, request);
    return [{ taskId: t.taskId, tryNumber: t.tryNumber, request, key, cached: store.cacheGet(key) }];
  });
  return { jobs, noReplies, errored };
}

export const callsToSend = (plan: ClaimsPlan): number => plan.jobs.filter((j) => j.cached === null && j.request.replySteps.length > 0).length;

export type ClaimsProgress = { done: number; total: number; sent: number; replayed: number; ungraded: number };

export type ClaimsOutcome = {
  checks: { taskId: string; tryNumber: number; claims: ClaimCheck }[];
  sent: number;
  // Null when every try was checked.
  stop: { reason: "daily" | "busy" | "config" | "errors" | "interrupted"; message: string } | null;
};

// Calls that failed in a row (not limits) before stopping: past this it's
// the key or the model, not one try.
const STOP_AFTER_FAILURES_IN_A_ROW = 3;

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
  const { judge, setup, clock, store } = o;
  const gap = Math.ceil(60_000 / judge.freeTierLimits.requestsPerMinute);
  const checks: ClaimsOutcome["checks"] = [];
  const progress: ClaimsProgress = { done: 0, total: o.plan.jobs.length, sent: 0, replayed: 0, ungraded: 0 };
  let lastSentAt = -Infinity;
  let failuresInARow = 0;

  const record = (job: ClaimsJob, claims: ClaimCheck) => {
    checks.push({ taskId: job.taskId, tryNumber: job.tryNumber, claims });
    progress.done++;
    if (claims.status === "ungraded") progress.ungraded++;
    o.onProgress({ ...progress });
  };

  // The raw answer, cached before it's read: a malformed one is kept too, so
  // it reads as "couldn't grade" again rather than being asked for again.
  const send = async (job: ClaimsJob): Promise<string> => {
    if (o.model === null) throw new Error("A judge call was needed, but no judge model was connected.");
    const at = clock.now();
    let text: string;
    let usage: { inputTokens: number | undefined; outputTokens: number | undefined };
    try {
      const result = await generateText({
        model: o.model,
        instructions: setup.prompt,
        prompt: job.request.input,
        temperature: judge.temperature,
        output: Output.object({ schema: claimsAnswerSchema }),
        providerOptions: judgeProviderOptions(judge),
        timeout: { stepMs: judge.stepTimeoutSeconds * 1000 },
        maxRetries: 0,
      });
      // The raw text, never `result.output`: reading that would throw on a
      // malformed answer, which has to be recorded rather than lost.
      text = result.text;
      usage = result.usage;
    } catch (error) {
      if (!NoObjectGeneratedError.isInstance(error)) throw error;
      text = error.text ?? "";
      usage = { inputTokens: error.usage?.inputTokens, outputTokens: error.usage?.outputTokens };
    }
    store.recordProviderCall({ at, provider: judge.provider, model: judge.model, inputTokens: usage.inputTokens ?? 0, cachedInputTokens: 0, outputTokens: usage.outputTokens ?? 0 });
    store.cachePut(job.key, text, new Date(at).toISOString());
    return text;
  };

  for (const job of o.plan.jobs) {
    if (o.stopRequested()) return { checks, sent: progress.sent, stop: { reason: "interrupted", message: "Stopped by Ctrl-C." } };
    if (job.request.replySteps.length === 0) {
      record(job, { status: "checked", model: setup.model, promptVersion: setup.promptVersion, claims: [] });
      continue;
    }
    if (job.cached !== null) {
      progress.replayed++;
      record(job, readClaimsAnswer(job.cached, job.request, setup));
      continue;
    }

    let text: string | null = null;
    for (let attempt = 0; text === null; attempt++) {
      if (o.sentToday + progress.sent >= judge.freeTierLimits.requestsPerDay) {
        return { checks, sent: progress.sent, stop: { reason: "daily", message: `${judge.freeTierLimits.requestsPerDay} judge calls sent in the last 24 hours: that's the configured daily limit.` } };
      }
      const wait = lastSentAt + gap - clock.now();
      if (wait > 0) await clock.sleep(wait);
      if (o.stopRequested()) return { checks, sent: progress.sent, stop: { reason: "interrupted", message: "Stopped by Ctrl-C." } };
      lastSentAt = clock.now();
      try {
        progress.sent++;
        text = await send(job);
        failuresInARow = 0;
      } catch (error) {
        const failure = classifyFailure(error, o.describeError);
        if (failure.kind === "daily") return { checks, sent: progress.sent, stop: { reason: "daily", message: failure.message } };
        if (failure.kind === "config") return { checks, sent: progress.sent, stop: { reason: "config", message: failure.message } };
        if (failure.kind === "busy") {
          if (attempt >= BUSY_RETRIES) return { checks, sent: progress.sent, stop: { reason: "busy", message: `Still busy after ${BUSY_RETRIES} retries. ${failure.message}` } };
          const ms = busyWaitMs(failure, attempt);
          o.onNotice(`${job.taskId} try ${job.tryNumber}: the judge is busy or rate limiting; waiting ${Math.round(ms / 1000)}s, then retrying.`);
          await clock.sleep(ms);
          continue;
        }
        // One call that failed (timeout, network): nothing is recorded for
        // the try, so the next `pnpm claims` asks again.
        failuresInARow++;
        o.onNotice(`${job.taskId} try ${job.tryNumber}: ${failure.message} Left unchecked.`);
        if (failuresInARow >= STOP_AFTER_FAILURES_IN_A_ROW) {
          return { checks, sent: progress.sent, stop: { reason: "errors", message: `${failuresInARow} judge calls in a row failed. The last one said: ${failure.message}` } };
        }
        break;
      }
    }
    if (text !== null) record(job, readClaimsAnswer(text, job.request, setup));
  }
  return { checks, sent: progress.sent, stop: null };
}
