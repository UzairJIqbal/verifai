// One run of the dev split from the terminal, shared by `pnpm eval` and
// `pnpm noise`: load everything, print the budget, run the tries, write the
// results and print the report. Stops cleanly at the daily limit or Ctrl-C;
// the same configuration carries the same unfinished run on next time.
import { relative } from "node:path";
import { styleText } from "node:util";
import { loadConfig, PROJECT_ROOT, type Config } from "../config";
import { getShopToday, openFreshShop } from "../shop/db";
import { loadAgentVersion, type AgentVersion } from "../agent/versions";
import { connectAgent, describeModelError, type AgentConnection } from "../agent/model";
import { loadTasks, type LoadedTasks } from "../tasks/load";
import type { Difficulty, Task } from "../tasks/schema";
import { cacheKey } from "./cache";
import { estimateBudget, type Budget } from "./budget";
import { Pacer, estimateTokens, type Clock } from "./pacer";
import { buildRunConfig, configKey, firstRequest, newRunId, runFingerprint } from "./plan";
import { pickSmokeTasks } from "./smoke";
import { makeRedactor, type Redact } from "./redact";
import { runTrials, type PoolProvider, type Progress } from "./runner";
import { EVAL_STORE_PATH, EvalStore, tryKey, type RunConfig, type StoredRun } from "./store";
import { langfuseSecrets, startTracing, type Tracing } from "./tracing";
import { statsTable, successLine, writeResults } from "../results/write";
import type { Report } from "../results/schema";

export const dim = (text: string) => styleText("dim", text);
export const n = (value: number) => Math.round(value).toLocaleString("en-US");
export const compact = (value: number) =>
  value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 10_000 ? `${Math.round(value / 1000)}k` : n(value);

export function fatal(message: string): never {
  console.error(styleText("red", `✗ ${message}`));
  process.exit(1);
}

// One line that rewrites itself in a terminal; anything else gets a line per
// finished try instead.
function makeProgressLine(labels: Map<string, string>) {
  const live = process.stdout.isTTY;
  let last = "";
  let lastDone = -1;
  const format = (p: Progress) =>
    `  tries ${p.done}/${p.total} · ${p.passed} passed · ${p.failed} failed · ${p.errored} errored · ` +
    `calls ${p.sentCalls} sent (${Object.entries(p.sentByProvider).map(([id, sent]) => `${labels.get(id) ?? id} ${sent}`).join(", ")}), ` +
    `${p.replayedCalls} replayed · ${compact(p.countedTokens)} tokens counted`;
  const clear = () => {
    if (live && last !== "") {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
    }
  };
  return {
    update(p: Progress) {
      last = format(p);
      if (live) {
        clear();
        process.stdout.write(last);
      } else if (p.done !== lastDone) {
        console.log(last);
      }
      lastDone = p.done;
    },
    // Prints a line above the progress line, then puts it back.
    notice(message: string) {
      clear();
      console.log(styleText("yellow", `  … ${message}`));
      if (live && last !== "") process.stdout.write(last);
    },
    end() {
      if (live && last !== "") process.stdout.write("\n");
      last = "";
    },
  };
}

// Sleeps that Ctrl-C can cut short, so a run waiting out a rate limit stops at once.
function makeClock(): Clock & { wakeAll: () => void } {
  const wakers = new Set<() => void>();
  return {
    now: () => Date.now(),
    sleep: (ms) =>
      new Promise<void>((resolve) => {
        const wake = () => {
          clearTimeout(timer);
          wakers.delete(wake);
          resolve();
        };
        const timer = setTimeout(wake, ms);
        wakers.add(wake);
      }),
    wakeAll: () => [...wakers].forEach((wake) => wake()),
  };
}

export type Session = {
  config: Config;
  loaded: LoadedTasks;
  tasks: Task[];
  difficulties: Map<string, Difficulty>;
  version: AgentVersion;
  agents: AgentConnection[];
  labels: Map<string, string>;
  pacers: Map<string, Pacer>;
  redact: Redact;
  store: EvalStore;
  tracing: Tracing;
  runConfig: RunConfig;
  configKey: string;
  useCache: boolean;
  smoke: boolean;
  close: () => Promise<void>;
};

export async function openSession(args: { useCache: boolean; smoke: boolean }): Promise<Session> {
  const { useCache, smoke } = args;
  let config: Config;
  let loaded: LoadedTasks;
  let tasks: Task[];
  let version: AgentVersion;
  let agents: AgentConnection[];
  // One per provider, each with its own per-minute budget. Filled when a run
  // starts, once the store can say what each provider still counts from the
  // last minute.
  const pacers = new Map<string, Pacer>();
  try {
    config = loadConfig();
    loaded = loadTasks();
    tasks = smoke ? pickSmokeTasks(loaded.tasks, config.runner.smokeTasks) : loaded.tasks;
    const shop = openFreshShop();
    const today = getShopToday(shop.db);
    shop.dispose();
    version = loadAgentVersion(config, today);
    agents = config.agent.pool.map((member) => connectAgent(member, (remaining) => pacers.get(member.provider)?.observeRemaining(remaining)));
  } catch (error) {
    fatal(error instanceof Error ? error.message : String(error));
  }
  if (tasks.length === 0) fatal("There are no dev tasks in evals/tasks.jsonl.");

  const redact = makeRedactor([...agents.flatMap((a) => a.secrets), ...langfuseSecrets()]);
  const store = new EvalStore(EVAL_STORE_PATH, redact);
  const runConfig = buildRunConfig({ config, version, datasetVersion: loaded.version, split: "dev", tasks, useCache, smoke });
  const tracing = await startTracing(redact);
  return {
    config,
    loaded,
    tasks,
    difficulties: new Map(loaded.tasks.map((t) => [t.id, t.difficulty])),
    version,
    agents,
    labels: new Map(agents.map((a) => [a.provider, a.label])),
    pacers,
    redact,
    store,
    tracing,
    runConfig,
    configKey: configKey(runConfig),
    useCache,
    smoke,
    close: async () => {
      if (tracing.on) await tracing.shutdown();
      store.close();
    },
  };
}

// The tries a run still has to do, and how many of those the cache answers.
export function remainingTries(s: Session, runId: string | null): { left: number; cached: number } {
  const finished = runId === null ? new Set<string>() : s.store.finishedTries(runId);
  const remaining = s.tasks.flatMap((task) =>
    Array.from({ length: s.runConfig.triesPerTask }, (_, i) => ({ task, tryNumber: i + 1 })).filter((t) => !finished.has(tryKey(t.task.id, t.tryNumber))),
  );
  const { config, version } = s;
  const cached = s.useCache
    ? remaining.filter(({ task, tryNumber }) => {
        const key = cacheKey({ model: config.agent.model, temperature: config.agent.temperature, reasoningEffort: config.agent.reasoningEffort, request: firstRequest(version, task), tryNumber });
        return s.store.cacheGet(key) !== null;
      }).length
    : 0;
  return { left: remaining.length, cached };
}

export function budgetFor(s: Session, triesLeft: number, cachedTries: number): Budget {
  // Until there's history, a first request's size and a guess at the reply.
  const guessed = estimateTokens(firstRequest(s.version, s.tasks[0])) * 1.5;
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  return estimateBudget({
    triesLeft,
    cachedTries,
    callsPerTry: s.store.averageCallsPerTry() ?? 4,
    usagePerCall: s.store.averageUsagePerCall() ?? { inputTokens: guessed, cachedInputTokens: 0, outputTokens: 0 },
    providers: s.config.agent.pool.map((m) => ({ provider: m.provider, limits: m.freeTierLimits, usedToday: s.store.usageSince(m.provider, dayAgo) })),
  });
}

export function printProviders(s: Session, budget: Budget): void {
  for (const p of budget.providers) {
    console.log(
      `    ${(s.labels.get(p.provider) ?? p.provider).padEnd(11)} left today ${compact(p.leftUnits)} of ${compact(p.allowance)} ${p.unit} · enough for ~${n(p.callsLeftToday)} calls`,
    );
  }
}

// The run report in the terminal: the success rate with its interval, then
// pass^k and pass@k for the whole run, each category and each difficulty.
export function printReport(report: Report): void {
  if (!report.stats) return;
  console.log(`\n${styleText("bold", successLine(report.stats))}`);
  console.log(dim("  Brackets are 95% intervals from resampling tasks. pass^k: all k tries of a task pass. pass@k: at least one does."));
  const { header, rows } = statsTable(report.stats);
  const table = [header, ...rows];
  const widths = header.map((_, i) => Math.max(...table.map((r) => r[i].length)));
  const line = (r: string[]) => `  ${r.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join("  ")}`;
  console.log(dim(line(header)));
  rows.forEach((r, i) => {
    // A gap between the whole run, the categories and the difficulties.
    if (i === 1 || i === 1 + Object.keys(report.stats?.byCategory ?? {}).length) console.log("");
    console.log(line(r));
  });
  if (report.totals.errored > 0) {
    console.log(styleText(["yellow", "bold"], `⚠ ${report.totals.errored} tries errored. They count as not passed, so these rates understate the agent.`));
  }
}

export type RunOutcome = { run: StoredRun; finished: true; report: Report; dir: string } | { run: StoredRun; finished: false };

// Runs (or carries on) the run with the session's configuration. It never
// carries on `notRun`, so a noise measurement's second run can't be its first.
export async function executeRun(s: Session, args: { title: string; command: string; notRun?: string }): Promise<RunOutcome> {
  const { config, runConfig, store, labels, smoke, useCache } = s;
  const fingerprint = runFingerprint(runConfig);

  let run: StoredRun;
  const found = store.findUnfinishedRun(fingerprint);
  const existing = found !== null && found.id !== args.notRun ? found : null;
  if (existing) {
    run = existing;
  } else {
    const now = new Date();
    const id = newRunId(now);
    store.createRun({ id, createdAt: now.toISOString(), fingerprint, config: runConfig });
    run = { id, createdAt: now.toISOString(), finishedAt: null, status: "running", config: runConfig };
  }
  const total = s.tasks.length * runConfig.triesPerTask;
  const { left, cached } = remainingTries(s, run.id);

  const holdout = Object.values(s.loaded.holdoutCounts).reduce((a, b) => a + b, 0);
  console.log(
    styleText("bold", `VerifAI ${args.title} · run ${run.id} · dataset ${s.loaded.version} · ${s.tasks.length} dev tasks × ${runConfig.triesPerTask} tries = ${total}`),
  );
  console.log(dim(`  agent ${s.version.label} · ${config.agent.model} from ${s.agents.map((a) => a.label).join(", then ")} · temperature ${config.agent.temperature}`));
  if (smoke) console.log(dim(`  smoke: ${s.tasks.map((t) => t.id).join(", ")} · checks the machinery, never a score, comparison or gate`));
  console.log(dim(`  ${existing ? `carrying on: ${total - left} of ${total} tries already done` : "new run"} · cache ${useCache ? "on" : "off (--no-cache)"} · ${holdout} holdout tasks not loaded`));
  const others = store.unfinishedRuns().filter((r) => r.id !== run.id);
  if (!existing && others.length > 0) {
    console.log(dim(`  ${others.length} unfinished run(s) had a different configuration, so this is a new run.`));
  }
  console.log(dim(s.tracing.on ? "  tracing on: each try goes to Langfuse" : `  tracing is off: ${s.tracing.reason}`));

  // The budget line: what's left to send, against what's left of today.
  const budget = budgetFor(s, left, cached);
  console.log(`\nBudget ${dim("(rough; \"today\" is the last 24 hours, by our own count)")}`);
  console.log(`  Agent pool:  ${left} tries to go, ${cached} replayed from the cache · ~${n(budget.calls)} calls, ~${compact(budget.countedTokens)} tokens`);
  printProviders(s, budget);
  if (!budget.fitsToday) {
    console.log(
      styleText("yellow", `  Won't finish today. It stops cleanly when every provider is at its limit and \`${args.command}\` carries on; about ${budget.days} days in all.`),
    );
  }
  console.log(`  Gemini (judge): 0 calls · no model graders yet\n`);

  const clock = makeClock();
  // Each starts from what its provider still counts from calls in the last minute.
  for (const m of config.agent.pool) s.pacers.set(m.provider, new Pacer(m.freeTierLimits, clock, store.recentCalls(m.provider, Date.now() - 60_000)));
  const pool: PoolProvider[] = s.agents.map((a, i) => {
    const member = config.agent.pool[i];
    const pacer = s.pacers.get(a.provider);
    if (!pacer) throw new Error(`No pacer for ${a.provider}.`);
    return {
      provider: a.provider,
      label: a.label,
      model: a.model,
      pacer,
      describeError: (error) => describeModelError(error, member, config.agent.stepTimeoutSeconds),
      dailyAfterLimitErrors: a.dailyAfterLimitErrors,
    };
  });
  const progressLine = makeProgressLine(labels);
  let interrupted = false;
  const onInterrupt = () => {
    if (interrupted) {
      progressLine.end();
      console.log(styleText("red", "Stopped at once. Tries in progress are lost and will be redone."));
      process.exit(130);
    }
    interrupted = true;
    progressLine.notice("Stopping: no new tries start; tries in progress are dropped and redone next time. Ctrl-C again to quit at once.");
    clock.wakeAll();
  };
  process.on("SIGINT", onInterrupt);

  let outcome;
  try {
    outcome = await runTrials({
      store,
      runId: run.id,
      config: runConfig,
      pool,
      setup: {
        temperature: config.agent.temperature,
        maxSteps: config.agent.maxSteps,
        stepTimeoutMs: config.agent.stepTimeoutSeconds * 1000,
        reasoningEffort: config.agent.reasoningEffort,
        version: s.version,
      },
      tasks: s.tasks,
      concurrency: config.runner.concurrency,
      clock,
      describeError: (error) => (error instanceof Error ? error.message : String(error)),
      tracer: s.tracing.on ? s.tracing.tracerFor(run.id, runConfig) : null,
      stopRequested: () => interrupted,
      onNotice: (message) => progressLine.notice(message),
      onProgress: (p) => progressLine.update(p),
    });
  } catch (error) {
    progressLine.end();
    await s.close();
    // Something in our own code broke (a grader, the store). The tries saved
    // so far are kept; nothing is counted from the one that broke.
    fatal(`The run crashed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  } finally {
    process.off("SIGINT", onInterrupt);
  }
  progressLine.end();

  const trials = store.loadTrials(run.id);
  if (!outcome.finished) {
    const passed = trials.filter((t) => t.status === "passed").length;
    console.log(styleText(["yellow", "bold"], `\n■ Stopped: ${outcome.message}`));
    console.log(`  ${trials.length} of ${total} tries done (${passed} passed so far). Nothing is lost; finished tries are saved and never redone.`);
    console.log(`  To carry on: ${styleText("bold", args.command)}${outcome.reason === "daily" ? " (after the limit resets)" : ""}`);
    if (outcome.reason === "config") console.log("  Fix the problem above first.");
    return { run, finished: false };
  }

  const finishedAt = new Date().toISOString();
  const finishedRun: StoredRun = { ...run, status: "finished", finishedAt };
  const written = writeResults(finishedRun, trials, s.difficulties, finishedAt, s.redact);
  // Only once its files exist: if writing them fails, the run stays
  // unfinished and the next `pnpm eval` writes them again.
  store.finishRun(run.id, finishedAt);
  const { report } = written;
  if (smoke) {
    const t = report.totals;
    console.log(`\n${styleText("bold", `Smoke run finished: ${t.passed} of ${t.trials} tries passed, ${t.errored} errored.`)}`);
    console.log(dim("  This checks the machinery works. It's not a score: use `pnpm eval` for that."));
  } else {
    printReport(report);
  }
  console.log(dim(`  Results: ${relative(PROJECT_ROOT, written.dir)}/ · open the runs page with \`pnpm dev\``));
  return { run: finishedRun, finished: true, report, dir: written.dir };
}
