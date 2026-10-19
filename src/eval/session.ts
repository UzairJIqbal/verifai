// One run from the terminal, shared by `pnpm eval`, `pnpm noise` and `pnpm
// gate`: load everything, print the budget, run the tries, write the results
// and print the report. Dev unless the gate hands it holdout tasks. Stops cleanly at the daily limit or Ctrl-C;
// the same configuration carries the same unfinished run on next time.
import { relative } from "node:path";
import { createInterface } from "node:readline/promises";
import { styleText } from "node:util";
import { loadConfig, PROJECT_ROOT, type Config } from "../config";
import { getShopToday, openFreshShop } from "../shop/db";
import { knobsOf, loadAgentVersion, type AgentKnobs, type AgentVersion } from "../agent/versions";
import { cachedEmbedding, connectEmbedder, embedTexts, embeddingSecrets, uncachedTexts, type SendEmbeddings } from "../embedding/embed";
import { checkExemplarsFit, exemplarBlock, exemplarStoreHash, pickExemplars, readExemplars, type Exemplar } from "../exemplars/store";
import { connectAgent, describeModelError, type AgentConnection } from "../agent/model";
import { loadTasks, type LoadedTasks } from "../tasks/load";
import type { Split, Task } from "../tasks/schema";
import { readShopFacts } from "../graders/shop-facts";
import type { ShopFacts } from "../graders/steps";
import { cacheKey } from "./cache";
import { estimateBudget, type Budget } from "./budget";
import { Pacer, estimateTokens, type Clock } from "./pacer";
import { buildRunConfig, configKey, firstRequest, newRunId, runFingerprint } from "./plan";
import { pickSmokeTasks } from "./smoke";
import { makeRedactor, type Redact } from "./redact";
import { runTrials, type PoolProvider, type Progress } from "./runner";
import { EVAL_STORE_PATH, EvalStore, tryKey, type RunConfig, type StoredRun } from "./store";
import { langfuseSecrets, startTracing, type Tracing } from "./tracing";
import { judgeCoverage, judgeTable } from "../results/judge-text";
import { claimCoverage, hallucinationTable } from "../results/hallucination-text";
import { graderTables, statsTable, successLine, writeResults } from "../results/write";
import type { Report } from "../results/schema";

export const dim = (text: string) => styleText("dim", text);
export const n = (value: number) => Math.round(value).toLocaleString("en-US");
export const compact = (value: number) =>
  value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 10_000 ? `${Math.round(value / 1000)}k` : n(value);

export function fatal(message: string): never {
  console.error(styleText("red", `✗ ${message}`));
  process.exit(1);
}

// Yes only for a typed y or yes.
export async function ask(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
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
export function makeClock(): Clock & { wakeAll: () => void } {
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

// Which agent on which tasks. Without one: the promoted version from the
// config on the dev split. Holdout tasks come only from the gate, which is
// the one caller allowed to load them; it passes the dev ids too, since
// exemplars may only ever come from dev.
export type SessionPlan =
  | { split: "dev"; knobs: AgentKnobs; loaded: LoadedTasks }
  | { split: "holdout"; knobs: AgentKnobs; loaded: LoadedTasks; devTaskIds: Set<string> };

// Exemplar memory for a version that uses it. Each task's pick needs an
// embedding of its first message; `send` gets the ones not cached.
type SessionExemplars = { entries: Exemplar[]; send: SendEmbeddings; byTask: Map<string, AgentVersion> | null };

export type Session = {
  config: Config;
  loaded: LoadedTasks;
  split: Split;
  tasks: Task[];
  // Every task of the split by id, for the results files.
  tasksById: Map<string, Task>;
  shop: ShopFacts;
  version: AgentVersion;
  exemplars: SessionExemplars | null;
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

export async function openSession(args: { useCache: boolean; smoke: boolean; plan?: SessionPlan }): Promise<Session> {
  const { useCache, smoke } = args;
  let config: Config;
  let plan: SessionPlan;
  let tasks: Task[];
  let version: AgentVersion;
  let agents: AgentConnection[];
  let shopFacts: ShopFacts;
  let exemplars: SessionExemplars | null = null;
  let secrets: (string | undefined)[] = [];
  // One per provider, each with its own per-minute budget. Filled when a run
  // starts, once the store can say what each provider still counts from the
  // last minute.
  const pacers = new Map<string, Pacer>();
  try {
    config = loadConfig();
    plan = args.plan ?? { split: "dev", knobs: knobsOf(config), loaded: loadTasks() };
    if (plan.split === "holdout" && smoke) throw new Error("A smoke run is dev only.");
    tasks = smoke ? pickSmokeTasks(plan.loaded.tasks, config.runner.smokeTasks) : plan.loaded.tasks;
    const shop = openFreshShop();
    const today = getShopToday(shop.db);
    shopFacts = readShopFacts(shop.db, today);
    shop.dispose();
    version = loadAgentVersion(plan.knobs, today);
    agents = config.agent.pool.map((member) => connectAgent(member, (remaining) => pacers.get(member.provider)?.observeRemaining(remaining)));
    if (version.exemplars) {
      const devIds = plan.split === "dev" ? new Set(plan.loaded.tasks.map((t) => t.id)) : plan.devTaskIds;
      const entries = readExemplars(devIds);
      if (entries.length === 0) throw new Error("This version uses exemplars, but evals/exemplars.jsonl has none. Add some with `pnpm exemplars:add <dev run>`.");
      checkExemplarsFit(entries, config.embedding);
      const embedder = connectEmbedder(config.embedding);
      exemplars = { entries, send: embedder.send, byTask: null };
      secrets = embedder.secrets;
    }
  } catch (error) {
    fatal(error instanceof Error ? error.message : String(error));
  }
  const { loaded } = plan;
  if (tasks.length === 0) fatal(`There are no ${plan.split} tasks in evals/tasks.jsonl.`);

  const redact = makeRedactor([...agents.flatMap((a) => a.secrets), ...langfuseSecrets(), ...secrets, ...embeddingSecrets(config.embedding)]);
  const store = new EvalStore(EVAL_STORE_PATH, redact);
  const runConfig = buildRunConfig({
    config,
    version,
    datasetVersion: loaded.version,
    split: plan.split,
    tasks,
    useCache,
    smoke,
    exemplars: exemplars ? { storeHash: exemplarStoreHash(exemplars.entries), entries: exemplars.entries.length } : null,
  });
  // A trace shows the whole trajectory, so a holdout try is never traced:
  // nothing of it may be readable before its version is promoted.
  const tracing: Tracing = plan.split === "holdout" ? { on: false, reason: "holdout tries are never traced, so none can be read before promotion" } : await startTracing(redact);
  return {
    config,
    loaded,
    split: plan.split,
    tasks,
    tasksById: new Map(loaded.tasks.map((t) => [t.id, t])),
    shop: shopFacts,
    version,
    exemplars,
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

/**
 * The tries a run still has, and how many of them the cache already holds,
 * so the estimate counts only the calls that will really be sent. A try is
 * cached when its first model call is: with the same prompt, tools and
 * conversation at temperature 0, every call after it replays too. `keyFor`
 * gives null when a try's request can't be known yet (exemplars waiting on
 * an embedding); that try counts as not cached.
 */
export function countRemaining(args: {
  tasks: Task[];
  triesPerTask: number;
  finished: Set<string>;
  keyFor: (task: Task, tryNumber: number) => string | null;
  isCached: (key: string) => boolean;
}): { left: number; cached: number } {
  const remaining = args.tasks.flatMap((task) =>
    Array.from({ length: args.triesPerTask }, (_, i) => ({ task, tryNumber: i + 1 })).filter((t) => !args.finished.has(tryKey(t.task.id, t.tryNumber))),
  );
  const cached = remaining.filter(({ task, tryNumber }) => {
    const key = args.keyFor(task, tryNumber);
    return key !== null && args.isCached(key);
  }).length;
  return { left: remaining.length, cached };
}

export function remainingTries(s: Session, runId: string | null): { left: number; cached: number } {
  const { config } = s;
  return countRemaining({
    tasks: s.tasks,
    triesPerTask: s.runConfig.triesPerTask,
    finished: runId === null ? new Set<string>() : s.store.finishedTries(runId),
    keyFor: (task, tryNumber) => {
      const version = knownVersionFor(s, task);
      return version === null
        ? null
        : cacheKey({ model: config.agent.model, temperature: config.agent.temperature, reasoningEffort: config.agent.reasoningEffort, request: firstRequest(version, task), tryNumber });
    },
    // With the cache off nothing replays, so every try is sent.
    isCached: (key) => s.useCache && s.store.cacheGet(key) !== null,
  });
}

const withExemplars = (s: Session, task: Task, query: number[], entries: Exemplar[]): AgentVersion => ({
  ...s.version,
  systemPrompt: s.version.systemPrompt + exemplarBlock(pickExemplars(task, query, entries)),
});

// The version a task gets, if it can be known without a call: with exemplars,
// only once its first message's embedding is cached.
function knownVersionFor(s: Session, task: Task): AgentVersion | null {
  if (s.exemplars === null) return s.version;
  const ready = s.exemplars.byTask?.get(task.id);
  if (ready) return ready;
  const query = cachedEmbedding(s.store, s.config.embedding, task.first_message);
  return query === null ? null : withExemplars(s, task, query, s.exemplars.entries);
}

// How many first messages still need embedding before the run: the one
// embedding call it makes, if any.
export const embeddingsToSend = (s: Session): number => (s.exemplars === null ? 0 : uncachedTexts(s.store, s.config.embedding, s.tasks.map((t) => t.first_message)).length);

// Picks every task's exemplars, sending the embeddings the cache lacks.
async function prepareExemplars(s: Session): Promise<void> {
  if (s.exemplars === null || s.exemplars.byTask !== null) return;
  const { entries, send } = s.exemplars;
  const vectors = await embedTexts(s.store, s.config.embedding, s.tasks.map((t) => t.first_message), send);
  s.exemplars.byTask = new Map(s.tasks.map((t, i) => [t.id, withExemplars(s, t, vectors[i], entries)]));
}

export function budgetFor(s: Session, triesLeft: number, cachedTries: number): Budget {
  // Until there's history, a first request's size and a guess at the reply.
  const guessed = estimateTokens(firstRequest(s.version, s.tasks[0])) * 1.5;
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  return estimateBudget({
    triesLeft,
    cachedTries,
    callsPerTry: s.store.averageCallsPerTry() ?? 4,
    usagePerCall: s.store.averageUsagePerCall(s.config.agent.pool.map((m) => m.provider)) ?? { inputTokens: guessed, cachedInputTokens: 0, outputTokens: 0 },
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
export function printTable(header: string[], rows: string[][], gapsBefore: number[] = []): void {
  const table = [header, ...rows];
  const widths = header.map((_, i) => Math.max(...table.map((r) => r[i].length)));
  const line = (r: string[]) => `  ${r.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join("  ")}`;
  console.log(dim(line(header)));
  rows.forEach((r, i) => {
    if (gapsBefore.includes(i)) console.log("");
    console.log(line(r));
  });
}

export function printReport(report: Report): void {
  if (!report.stats) return;
  console.log(`\n${styleText("bold", successLine(report.stats))}`);
  console.log(dim("  Brackets are 95% intervals from resampling tasks. pass^k: all k tries of a task pass. pass@k: at least one does."));
  const { header, rows } = statsTable(report.stats);
  // A gap between the whole run, the categories and the difficulties.
  printTable(header, rows, [1, 1 + Object.keys(report.stats.byCategory).length]);
  printGraderReport(report);
  printHallucinationReport(report);
  printJudgeReport(report);
  if (report.totals.errored > 0) {
    console.log(styleText(["yellow", "bold"], `⚠ ${report.totals.errored} tries errored. They count as not passed, so these rates understate the agent.`));
  }
}

// How the tries got to their results. Only state and reply decide a pass; these
// are reported beside it.
export function printGraderReport(report: Report): void {
  if (!report.graders) return;
  const g = report.graders;
  console.log(`\n${styleText("bold", "Trajectory graders")} ${dim(`· ${g.tasks} tasks, ${g.tries} tries${g.errored > 0 ? `, ${g.errored} errored tries left out` : ""} · only state and reply decide a pass`)}`);
  console.log(dim("  \"couldn't grade\" is counted apart and never as a pass. Precision: of the tries that called a tool, how many needed it. Recall: of the tries that needed it, how many called it."));
  for (const t of graderTables(g)) {
    console.log(`\n  ${styleText("bold", t.title)}`);
    printTable(t.header, t.rows);
  }
}

export function printHallucinationReport(report: Report): void {
  if (!report.hallucination) return;
  console.log(`\n${styleText("bold", "Hallucination")} ${dim("· rates averaged over tasks, 95% intervals")}`);
  console.log(dim(`  ${claimCoverage(report.hallucination)}`));
  const { header, rows } = hallucinationTable(report.hallucination);
  printTable(header, rows);
}

// The AI judge's verdicts, in their own section: they never decide a pass.
export function printJudgeReport(report: Report): void {
  if (!report.judge) return;
  console.log(`\n${styleText("bold", "AI judge")} ${dim("· pass or fail per criterion, beside the success rate and never part of it · 95% intervals")}`);
  console.log(dim(`  ${judgeCoverage(report.judge)}`));
  const { header, rows } = judgeTable(report.judge);
  printTable(header, rows);
}

const versionLookup = (byTask: Map<string, AgentVersion>) => (task: Task): AgentVersion => {
  const version = byTask.get(task.id);
  // Every task was given its exemplars before the run; one without is a bug.
  if (!version) throw new Error(`No exemplars were picked for ${task.id}.`);
  return version;
};

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
    styleText("bold", `VerifAI ${args.title} · run ${run.id} · dataset ${s.loaded.version} · ${s.tasks.length} ${s.split} tasks × ${runConfig.triesPerTask} tries = ${total}`),
  );
  console.log(dim(`  agent ${s.version.label} · ${config.agent.model} from ${s.agents.map((a) => a.label).join(", then ")} · temperature ${config.agent.temperature}`));
  if (smoke) console.log(dim(`  smoke: ${s.tasks.map((t) => t.id).join(", ")} · checks the machinery, never a score, comparison or gate`));
  console.log(
    dim(
      `  ${existing ? `carrying on: ${total - left} of ${total} tries already done` : "new run"} · cache ${useCache ? "on" : "off (--no-cache)"} · ${
        s.split === "dev" ? `${holdout} holdout tasks not loaded` : "holdout: tries stay sealed (outcomes only) unless this version is promoted"
      }`,
    ),
  );
  if (s.exemplars) console.log(dim(`  exemplars: the ${s.exemplars.entries.length > 1 ? "2 most similar" : "1"} of ${s.exemplars.entries.length} dev conversations added to each prompt`));
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
  console.log(`  Judge (${config.judge.model}): 0 calls here · the claim checker runs on its own, with \`pnpm claims\`\n`);

  try {
    await prepareExemplars(s);
  } catch (error) {
    await s.close();
    fatal(`Couldn't pick exemplars: ${error instanceof Error ? error.message : String(error)}. Nothing was run.`);
  }

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
      ...(s.exemplars?.byTask ? { versionFor: versionLookup(s.exemplars.byTask) } : {}),
      tasks: s.tasks,
      shop: s.shop,
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
  const written = writeResults(finishedRun, trials, s.tasksById, finishedAt, s.redact);
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
