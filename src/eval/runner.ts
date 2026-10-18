// Runs the unfinished tries of one run, a few at a time, and saves each one
// whole as it finishes. Every model call goes through the cache, the pool,
// the pacers and the busy-provider retries here; the agent loop itself knows
// none of that.
import pLimit from "p-limit";
import type { LanguageModel } from "ai";
import type { AgentSetup, CallWrapper, ModelUsage } from "../agent/loop";
import { runTaskConversation } from "./conversation";
import type { TrajectoryEvent } from "./trajectory";
import { gradeTry, outcomePassed } from "../graders";
import type { ShopFacts } from "../graders/steps";
import { stepSchema, type Step, type RecordedTrial, type TrialStatus } from "../results/schema";
import type { Task } from "../tasks/schema";
import { cacheKey, decodeCachedCall, encodeCachedCall } from "./cache";
import { countedTokens, estimateTokens, type Clock, type Pacer, type Ticket } from "./pacer";
import { BUSY_RETRIES, busyWaitMs, classifyFailure } from "./provider-errors";
import { tryKey, type EvalStore, type RunConfig, type RunPrices } from "./store";

export type StopReason =
  // Today's free limit is used up on every provider in the pool.
  | "daily"
  // The providers stayed busy through every retry.
  | "busy"
  // The key or the model name is wrong.
  | "config"
  // Several tries in a row errored: something is wrong beyond one task.
  | "errors"
  // Ctrl-C.
  | "interrupted";

export type RunOutcome = { finished: true } | { finished: false; reason: StopReason; message: string };

export type Progress = {
  done: number;
  total: number;
  passed: number;
  failed: number;
  errored: number;
  // Calls actually sent while this command ran, and calls replayed from the cache.
  sentCalls: number;
  sentByProvider: Record<string, number>;
  replayedCalls: number;
  // Tokens of the sent calls that count toward the provider's limits.
  countedTokens: number;
};

// Turns a finished try into a trace and returns its link, or null.
export type TrialTracer = (trial: RecordedTrial, task: Task) => string | null;

// One provider of the pool, ready to call, with its own per-minute budget.
export type PoolProvider = {
  provider: string;
  label: string;
  model: LanguageModel;
  pacer: Pacer;
  describeError: (error: unknown) => string;
  // Limit errors in a row after which today's free limit counts as used up,
  // whatever they say; null to go by the wording alone.
  dailyAfterLimitErrors: number | null;
};

export type RunnerOptions = {
  store: EvalStore;
  runId: string;
  config: RunConfig;
  // In the order they're tried; the same providers as config.agent.pool.
  pool: PoolProvider[];
  // The agent as configured; the runner picks the model for each call.
  setup: Omit<AgentSetup, "model" | "provider" | "wrapCall">;
  tasks: Task[];
  // The seeded shop's ids and orders, which the trajectory graders check against.
  shop: ShopFacts;
  concurrency: number;
  clock: Clock;
  // For a failure outside any one provider's call.
  describeError: (error: unknown) => string;
  tracer: TrialTracer | null;
  stopRequested: () => boolean;
  onNotice: (message: string) => void;
  onProgress: (progress: Progress) => void;
  seedPath?: string;
};

export const STOP_AFTER_ERRORS_IN_A_ROW = 3;

class StopRun extends Error {
  constructor(
    readonly reason: StopReason,
    message: string,
  ) {
    super(message);
  }
}

// A model call that failed for this try alone; the message is already plain words.
class TryFailed extends Error {}

export function costUsd(usage: ModelUsage, prices: RunPrices): number {
  const fresh = usage.inputTokens - usage.cachedInputTokens;
  return (fresh * prices.input + usage.cachedInputTokens * prices.cachedInput + usage.outputTokens * prices.output) / 1_000_000;
}

// Each call is priced at the rates of the provider that answered it. A call
// replayed from the cache may have come from a provider no longer in the pool;
// it's priced as the first one's, since the cache holds no prices.
function pricesFor(provider: string, pool: RunConfig["agent"]["pool"]): RunPrices {
  return (pool.find((m) => m.provider === provider) ?? pool[0]).prices;
}

function toStep(event: TrajectoryEvent, pool: RunConfig["agent"]["pool"]): Step {
  // Parsed rather than cast: a tool input that isn't plain JSON fails here,
  // loudly, instead of being written half-right.
  return stepSchema.parse(event.type === "model" ? { ...event, costUsd: costUsd(event.usage, pricesFor(event.provider, pool)) } : event);
}

function buildTrial(args: {
  task: Task;
  tryNumber: number;
  status: TrialStatus;
  end: RecordedTrial["end"];
  error: string | null;
  verdicts: RecordedTrial["verdicts"];
  events: TrajectoryEvent[];
  pool: RunConfig["agent"]["pool"];
  startedAt: number;
  finishedAt: number;
}): RecordedTrial {
  const steps = args.events.map((e) => toStep(e, args.pool));
  const models = steps.filter((s): s is Extract<Step, { type: "model" }> => s.type === "model");
  const sum = (pick: (s: (typeof models)[number]) => number) => models.reduce((total, s) => total + pick(s), 0);
  return {
    taskId: args.task.id,
    category: args.task.category,
    tryNumber: args.tryNumber,
    status: args.status,
    end: args.end,
    error: args.error,
    verdicts: args.verdicts,
    calls: models.length,
    cachedCalls: models.filter((s) => s.cached).length,
    usage: {
      inputTokens: sum((s) => s.usage.inputTokens),
      cachedInputTokens: sum((s) => s.usage.cachedInputTokens),
      outputTokens: sum((s) => s.usage.outputTokens),
    },
    costUsd: sum((s) => s.costUsd),
    modelLatencyMs: sum((s) => s.latencyMs),
    startedAt: new Date(args.startedAt).toISOString(),
    finishedAt: new Date(args.finishedAt).toISOString(),
    traceUrl: null,
    claims: null,
    judge: null,
    steps,
  };
}

export async function runTrials(o: RunnerOptions): Promise<RunOutcome> {
  const { store, config, clock } = o;
  const saved = store.loadTrials(o.runId);
  const finished = new Set(saved.map((t) => tryKey(t.taskId, t.tryNumber)));
  const todo = o.tasks.flatMap((task) =>
    Array.from({ length: config.triesPerTask }, (_, i) => ({ task, tryNumber: i + 1 })).filter((t) => !finished.has(tryKey(t.task.id, t.tryNumber))),
  );

  const progress: Progress = {
    done: saved.length,
    total: o.tasks.length * config.triesPerTask,
    passed: saved.filter((t) => t.status === "passed").length,
    failed: saved.filter((t) => t.status === "failed").length,
    errored: saved.filter((t) => t.status === "errored").length,
    sentCalls: 0,
    sentByProvider: Object.fromEntries(o.pool.map((p) => [p.provider, 0])),
    replayedCalls: 0,
    countedTokens: 0,
  };
  const report = () => o.onProgress({ ...progress, sentByProvider: { ...progress.sentByProvider } });
  report();

  // Set from inside the parallel tries, so kept in an object TypeScript
  // doesn't narrow away.
  const halt: { stop: { reason: StopReason; message: string } | null; crash: unknown } = { stop: null, crash: null };
  const stopping = () => halt.stop !== null || halt.crash !== null || o.stopRequested();
  const abandon = () => new StopRun("interrupted", "Stopped before this try finished.");
  let errorsInARow = 0;

  // Shared by every try. A provider whose daily limit is used up is skipped
  // for the rest of this command; one that answered "busy" is skipped until
  // its wait is over.
  const exhausted = new Set<string>();
  const coolingUntil = new Map<string, number>();
  // Limit errors from each provider since its last answer, across every try.
  const limitErrorsInARow = new Map<string, number>();
  const labels = o.pool.map((p) => p.label).join(" and ");

  // The first provider, in pool order, with room for this call now. If every
  // provider still in play is at its per-minute limit, waits for the first.
  // Null if every one is cooling down; throws when none has any of today left.
  const pick = async (guess: number): Promise<{ member: PoolProvider; ticket: Ticket } | null> => {
    const open = o.pool.filter((p) => !exhausted.has(p.provider));
    if (open.length === 0) throw new StopRun("daily", `The free limit for today is used up on every provider in the pool (${labels}).`);
    const now = clock.now();
    const ready = open.filter((p) => (coolingUntil.get(p.provider) ?? 0) <= now);
    if (ready.length === 0) {
      await clock.sleep(Math.max(50, Math.min(...open.map((p) => coolingUntil.get(p.provider) ?? now)) - now));
      return null;
    }
    for (const member of ready) {
      const ticket = member.pacer.tryReserve(guess);
      if (ticket) return { member, ticket };
    }
    const ticket = await ready[0].pacer.reserve(guess, stopping);
    if (ticket === null) throw abandon();
    return { member: ready[0], ticket };
  };

  const runOne = async (task: Task, tryNumber: number): Promise<RecordedTrial> => {
    const events: TrajectoryEvent[] = [];
    const startedAt = clock.now();

    const wrapCall: CallWrapper = async (request, send) => {
      if (stopping()) throw abandon();
      const key = cacheKey({ model: config.agent.model, temperature: config.agent.temperature, reasoningEffort: config.agent.reasoningEffort, request, tryNumber });
      if (config.useCache) {
        const hit = store.cacheGet(key);
        const decoded = hit === null ? null : decodeCachedCall(hit);
        if (decoded) {
          progress.replayedCalls++;
          report();
          return { ...decoded, cached: true };
        }
      }
      const guess = estimateTokens(request);
      // Busy answers for this call, per provider and in all.
      const busyTimes = new Map<string, number>();
      let busyInAll = 0;
      for (;;) {
        if (stopping()) throw abandon();
        const picked = await pick(guess);
        if (picked === null) continue;
        const { member, ticket } = picked;
        const began = clock.now();
        try {
          const result = await send(member.model);
          const latencyMs = Math.round(clock.now() - began);
          limitErrorsInARow.set(member.provider, 0);
          const counted = countedTokens(result.usage);
          ticket.settle(result.usage);
          const poolEntry = config.agent.pool.find((m) => m.provider === member.provider);
          store.recordProviderCall({ at: began, provider: member.provider, model: poolEntry?.modelId ?? config.agent.model, ...result.usage });
          if (config.useCache) store.cachePut(key, encodeCachedCall({ result, provider: member.provider, latencyMs }), new Date(clock.now()).toISOString());
          progress.sentCalls++;
          progress.sentByProvider[member.provider] = (progress.sentByProvider[member.provider] ?? 0) + 1;
          progress.countedTokens += counted;
          report();
          return { result, provider: member.provider, latencyMs, cached: false };
        } catch (error) {
          // A refused request still took a slot this minute, but no tokens.
          ticket.settle(null);
          const failure = classifyFailure(error, member.describeError);
          const next = o.pool.find((p) => p !== member && !exhausted.has(p.provider) && (coolingUntil.get(p.provider) ?? 0) <= clock.now());
          // Who takes over once this one is used up for today, even if it's waiting out a minute.
          const takesOver = o.pool.find((p) => p !== member && !exhausted.has(p.provider));
          const inARow = failure.kind === "busy" && failure.limit ? (limitErrorsInARow.get(member.provider) ?? 0) + 1 : 0;
          limitErrorsInARow.set(member.provider, inARow);
          if (member.dailyAfterLimitErrors !== null && inARow >= member.dailyAfterLimitErrors) {
            exhausted.add(member.provider);
            o.onNotice(
              `${member.label} refused ${inARow} calls in a row with a limit error, so its free limit for today counts as used up` +
                `${takesOver ? `; carrying on with ${takesOver.label}` : ""}.`,
            );
            continue;
          }
          if (failure.kind === "daily") {
            exhausted.add(member.provider);
            o.onNotice(`${member.label}'s free limit for today is used up${takesOver ? `; carrying on with ${takesOver.label}` : ""}. ${failure.message}`);
            continue;
          }
          if (failure.kind === "busy") {
            busyInAll++;
            if (busyInAll > BUSY_RETRIES * o.pool.length) {
              throw new StopRun("busy", `${labels} stayed busy through ${busyInAll - 1} retries. ${failure.message}`);
            }
            const times = busyTimes.get(member.provider) ?? 0;
            busyTimes.set(member.provider, times + 1);
            const wait = busyWaitMs(failure, times);
            coolingUntil.set(member.provider, Math.max(coolingUntil.get(member.provider) ?? 0, clock.now() + wait));
            o.onNotice(
              `${task.id} try ${tryNumber}: ${member.label} is busy or rate limiting; ` +
                (next ? `sending to ${next.label} instead.` : `waiting ${Math.round(wait / 1000)}s, then retrying.`),
            );
            continue;
          }
          if (failure.kind === "config") throw new StopRun("config", failure.message);
          throw new TryFailed(failure.message);
        }
      }
    };

    let status: TrialStatus;
    let end: RecordedTrial["end"] = null;
    let error: string | null = null;
    let verdicts: RecordedTrial["verdicts"] = [];
    try {
      // The wrapper picks the model for every call; the first in the pool is
      // only the setup's placeholder.
      const setup: AgentSetup = { ...o.setup, model: o.pool[0].model, provider: o.pool[0].provider, wrapCall };
      const trajectory = await runTaskConversation(setup, task, (e) => events.push(e), o.seedPath);
      // Graders run outside the catch: one that throws stops the run loudly
      // rather than turning into an errored try.
      end = trajectory.end;
      verdicts = gradeTry(task, trajectory, o.shop, o.setup.version.policy);
      status = outcomePassed(verdicts) ? "passed" : "failed";
    } catch (caught) {
      if (caught instanceof StopRun) throw caught;
      status = "errored";
      error = caught instanceof TryFailed ? caught.message : o.describeError(caught);
    }
    return buildTrial({ task, tryNumber, status, end, error, verdicts, events, pool: config.agent.pool, startedAt, finishedAt: clock.now() });
  };

  const limit = pLimit(o.concurrency);
  await Promise.all(
    todo.map(({ task, tryNumber }) =>
      limit(async () => {
        if (stopping()) return;
        try {
          const trial = await runOne(task, tryNumber);
          if (o.tracer) {
            try {
              trial.traceUrl = o.tracer(trial, task);
            } catch (traceError) {
              o.onNotice(`Couldn't trace ${task.id} try ${tryNumber}: ${traceError instanceof Error ? traceError.message : String(traceError)}`);
            }
          }
          store.saveTrial(o.runId, trial);
          progress.done++;
          progress[trial.status]++;
          report();
          if (trial.status === "errored") {
            errorsInARow++;
            o.onNotice(`${task.id} try ${tryNumber} errored: ${trial.error ?? "no message"}`);
            if (errorsInARow >= STOP_AFTER_ERRORS_IN_A_ROW) {
              halt.stop ??= { reason: "errors", message: `${errorsInARow} tries in a row errored. The last one said: ${trial.error ?? "no message"}` };
            }
          } else {
            errorsInARow = 0;
          }
        } catch (caught) {
          if (caught instanceof StopRun) {
            // A try abandoned because something else stopped the run doesn't
            // replace the reason it stopped.
            if (caught.reason !== "interrupted") halt.stop ??= { reason: caught.reason, message: caught.message };
            return;
          }
          halt.crash ??= caught;
        }
      }),
    ),
  );

  if (halt.crash !== null) throw halt.crash;
  if (halt.stop !== null) return { finished: false, ...halt.stop };
  if (progress.done < progress.total) return { finished: false, reason: "interrupted", message: "Stopped by Ctrl-C." };
  return { finished: true };
}
