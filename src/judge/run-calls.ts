// Sends judge-model calls for a run's tries: one call per try, one at a time,
// under the judge's per-minute and per-day limits. Every answer goes through
// the cache, so asking about the same tries again sends nothing. Shared by the
// claim checker and the AI judge, which differ only in what they ask and how
// they read the answer.
import { generateText, NoObjectGeneratedError, Output, type LanguageModel } from "ai";
import type { z } from "zod";
import type { JudgeConfig } from "../config";
import type { Clock } from "../eval/pacer";
import { BUSY_RETRIES, busyWaitMs, classifyFailure } from "../eval/provider-errors";
import type { EvalStore } from "../eval/store";
import { judgeProviderOptions } from "./model";
import type { JudgeSetup } from "./claims";

export type JudgeJob = {
  taskId: string;
  tryNumber: number;
  // What's sent, or null when the try has nothing to ask about: done without a call.
  input: string | null;
  key: string;
  cached: string | null;
};

export const callsToSend = (jobs: JudgeJob[]): number => jobs.filter((j) => j.input !== null && j.cached === null).length;

export type CallsProgress = { done: number; total: number; sent: number; replayed: number; ungraded: number };

export type StopReason = { reason: "daily" | "busy" | "config" | "errors" | "interrupted"; message: string };

export type CallsOutcome<R> = {
  results: { taskId: string; tryNumber: number; result: R }[];
  sent: number;
  // Null when every try was done.
  stop: StopReason | null;
};

// Calls that failed in a row (not limits) before stopping: past this it's
// the key or the model, not one try.
const STOP_AFTER_FAILURES_IN_A_ROW = 3;

export async function runJudgeCalls<J extends JudgeJob, R>(o: {
  store: EvalStore;
  jobs: J[];
  judge: JudgeConfig;
  setup: JudgeSetup;
  // The answer's shape, sent as the structured output Gemini must follow.
  schema: z.ZodType;
  // Null when nothing needs sending (every answer cached): no key needed.
  model: LanguageModel | null;
  clock: Clock;
  // Calls already sent to the judge in the last 24 hours, by our own count.
  sentToday: number;
  // The result for a job with nothing to ask (input null). Needed only by a
  // caller that plans such jobs.
  noCall?: (job: J) => R;
  read: (text: string, job: J) => R;
  isUngraded: (result: R) => boolean;
  describeError: (error: unknown) => string;
  stopRequested: () => boolean;
  onNotice: (message: string) => void;
  onProgress: (p: CallsProgress) => void;
}): Promise<CallsOutcome<R>> {
  const { judge, setup, clock, store } = o;
  const gap = Math.ceil(60_000 / judge.freeTierLimits.requestsPerMinute);
  const results: CallsOutcome<R>["results"] = [];
  const progress: CallsProgress = { done: 0, total: o.jobs.length, sent: 0, replayed: 0, ungraded: 0 };
  let lastSentAt = -Infinity;
  let failuresInARow = 0;
  const stopped = (stop: StopReason): CallsOutcome<R> => ({ results, sent: progress.sent, stop });
  const interrupted = () => stopped({ reason: "interrupted", message: "Stopped by Ctrl-C." });

  const record = (job: J, result: R) => {
    results.push({ taskId: job.taskId, tryNumber: job.tryNumber, result });
    progress.done++;
    if (o.isUngraded(result)) progress.ungraded++;
    o.onProgress({ ...progress });
  };

  // The raw answer, cached before it's read: a malformed one is kept too, so
  // it reads as "couldn't grade" again rather than being asked for again.
  const send = async (job: J, input: string): Promise<string> => {
    if (o.model === null) throw new Error("A judge call was needed, but no judge model was connected.");
    const at = clock.now();
    let text: string;
    let usage: { inputTokens: number | undefined; outputTokens: number | undefined };
    try {
      const result = await generateText({
        model: o.model,
        instructions: setup.prompt,
        prompt: input,
        temperature: judge.temperature,
        output: Output.object({ schema: o.schema }),
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

  for (const job of o.jobs) {
    if (o.stopRequested()) return interrupted();
    if (job.input === null) {
      if (o.noCall === undefined) throw new Error(`${job.taskId} try ${job.tryNumber} has nothing to ask the judge, and nothing says what that means.`);
      record(job, o.noCall(job));
      continue;
    }
    if (job.cached !== null) {
      progress.replayed++;
      record(job, o.read(job.cached, job));
      continue;
    }

    let text: string | null = null;
    for (let attempt = 0; text === null; attempt++) {
      if (o.sentToday + progress.sent >= judge.freeTierLimits.requestsPerDay) {
        return stopped({ reason: "daily", message: `${judge.freeTierLimits.requestsPerDay} judge calls sent in the last 24 hours: that's the configured daily limit.` });
      }
      const wait = lastSentAt + gap - clock.now();
      if (wait > 0) await clock.sleep(wait);
      if (o.stopRequested()) return interrupted();
      lastSentAt = clock.now();
      try {
        progress.sent++;
        text = await send(job, job.input);
        failuresInARow = 0;
      } catch (error) {
        const failure = classifyFailure(error, o.describeError);
        if (failure.kind === "daily") return stopped({ reason: "daily", message: failure.message });
        if (failure.kind === "config") return stopped({ reason: "config", message: failure.message });
        if (failure.kind === "busy") {
          if (attempt >= BUSY_RETRIES) return stopped({ reason: "busy", message: `Still busy after ${BUSY_RETRIES} retries. ${failure.message}` });
          const ms = busyWaitMs(failure, attempt);
          o.onNotice(`${job.taskId} try ${job.tryNumber}: the judge is busy or rate limiting; waiting ${Math.round(ms / 1000)}s, then retrying.`);
          await clock.sleep(ms);
          continue;
        }
        // One call that failed (timeout, network): nothing is recorded for
        // the try, so the next run of the command asks again.
        failuresInARow++;
        o.onNotice(`${job.taskId} try ${job.tryNumber}: ${failure.message} Left unchecked.`);
        if (failuresInARow >= STOP_AFTER_FAILURES_IN_A_ROW) {
          return stopped({ reason: "errors", message: `${failuresInARow} judge calls in a row failed. The last one said: ${failure.message}` });
        }
        break;
      }
    }
    if (text !== null) record(job, o.read(text, job));
  }
  return { results, sent: progress.sent, stop: null };
}
