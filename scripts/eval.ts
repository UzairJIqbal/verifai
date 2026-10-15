// `pnpm eval`: every dev task, 4 tries each, a few at a time, every step saved.
// Stops cleanly at the daily limit (or Ctrl-C); running it again carries the
// same run on from the next unfinished try. The holdout is never loaded here.
//
//   pnpm eval              run, replaying any call already in the cache
//   pnpm eval --no-cache   send every call afresh (to measure noise)
//   pnpm eval --smoke      only runner.smokeTasks, one dev task per category:
//                          checks the machinery, never a score
import { relative } from "node:path";
import { parseArgs, styleText } from "node:util";
import { loadConfig, PROJECT_ROOT, type Config } from "../src/config";
import { getShopToday, openFreshShop } from "../src/shop/db";
import { loadAgentVersion, type AgentVersion } from "../src/agent/versions";
import { connectAgent, describeModelError, type AgentConnection } from "../src/agent/model";
import { loadTasks, type LoadedTasks } from "../src/tasks/load";
import type { Task } from "../src/tasks/schema";
import { cacheKey } from "../src/eval/cache";
import { estimateBudget } from "../src/eval/budget";
import { Pacer, estimateTokens, type Clock } from "../src/eval/pacer";
import { buildRunConfig, firstRequest, newRunId, runFingerprint } from "../src/eval/plan";
import { pickSmokeTasks } from "../src/eval/smoke";
import { makeRedactor } from "../src/eval/redact";
import { runTrials, type PoolProvider, type Progress } from "../src/eval/runner";
import { EVAL_STORE_PATH, EvalStore, tryKey, type StoredRun } from "../src/eval/store";
import { langfuseSecrets, startTracing } from "../src/eval/tracing";
import { writeResults } from "../src/results/write";

const dim = (text: string) => styleText("dim", text);
const n = (value: number) => Math.round(value).toLocaleString("en-US");
const compact = (value: number) =>
  value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 10_000 ? `${Math.round(value / 1000)}k` : n(value);

function fatal(message: string): never {
  console.error(styleText("red", `✗ ${message}`));
  process.exit(1);
}

function parseFlags(): { useCache: boolean; smoke: boolean } {
  try {
    const { values } = parseArgs({
      options: { "no-cache": { type: "boolean", default: false }, smoke: { type: "boolean", default: false } },
      strict: true,
    });
    return { useCache: !values["no-cache"], smoke: values.smoke };
  } catch (error) {
    fatal(`${error instanceof Error ? error.message : String(error)}\nUsage: pnpm eval [--smoke] [--no-cache]`);
  }
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

async function main(): Promise<void> {
  const { useCache, smoke } = parseFlags();
  const command = ["pnpm eval", smoke ? "--smoke" : "", useCache ? "" : "--no-cache"].filter(Boolean).join(" ");

  let config: Config;
  let loaded: LoadedTasks;
  let tasks: Task[];
  let version: AgentVersion;
  let agents: AgentConnection[];
  // One per provider, each with its own per-minute budget. Filled below, once
  // the store can say what each provider still counts from the last minute.
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
  const labels = new Map<string, string>(agents.map((a) => [a.provider, a.label]));
  if (tasks.length === 0) fatal("There are no dev tasks in evals/tasks.jsonl.");

  const redact = makeRedactor([...agents.flatMap((a) => a.secrets), ...langfuseSecrets()]);
  const store = new EvalStore(EVAL_STORE_PATH, redact);
  const runConfig = buildRunConfig({ config, version, datasetVersion: loaded.version, split: "dev", tasks, useCache, smoke });
  const fingerprint = runFingerprint(runConfig);

  // Carry on the unfinished run with this exact configuration, if there is one.
  let run: StoredRun;
  const existing = store.findUnfinishedRun(fingerprint);
  if (existing) {
    run = existing;
  } else {
    const now = new Date();
    const id = newRunId(now);
    store.createRun({ id, createdAt: now.toISOString(), fingerprint, config: runConfig });
    run = { id, createdAt: now.toISOString(), finishedAt: null, status: "running", config: runConfig };
  }
  const total = tasks.length * runConfig.triesPerTask;
  const finished = store.finishedTries(run.id);

  const holdout = Object.values(loaded.holdoutCounts).reduce((a, b) => a + b, 0);
  console.log(
    styleText(
      "bold",
      `VerifAI ${smoke ? "smoke run" : "eval"} · run ${run.id} · dataset ${loaded.version} · ${tasks.length} dev tasks × ${runConfig.triesPerTask} tries = ${total}`,
    ),
  );
  console.log(
    dim(`  agent ${version.label} · ${config.agent.model} from ${agents.map((a) => a.label).join(", then ")} · temperature ${config.agent.temperature}`),
  );
  if (smoke) console.log(dim(`  smoke: ${tasks.map((t) => t.id).join(", ")} · checks the machinery, never a score, comparison or gate`));
  console.log(dim(`  ${existing ? `carrying on: ${finished.size} of ${total} tries already done` : "new run"} · cache ${useCache ? "on" : "off (--no-cache)"} · ${holdout} holdout tasks not loaded`));
  const others = store.unfinishedRuns().filter((r) => r.id !== run.id);
  if (!existing && others.length > 0) {
    console.log(dim(`  ${others.length} unfinished run(s) had a different configuration, so this is a new run.`));
  }

  const tracing = await startTracing(redact);
  console.log(dim(tracing.on ? "  tracing on: each try goes to Langfuse" : `  tracing is off: ${tracing.reason}`));

  // The budget line: what's left to send, against what's left of today.
  const remaining = tasks.flatMap((task) =>
    Array.from({ length: runConfig.triesPerTask }, (_, i) => ({ task, tryNumber: i + 1 })).filter((t) => !finished.has(tryKey(t.task.id, t.tryNumber))),
  );
  const cachedTries = useCache
    ? remaining.filter(({ task, tryNumber }) => {
        const key = cacheKey({ model: config.agent.model, temperature: config.agent.temperature, reasoningEffort: config.agent.reasoningEffort, request: firstRequest(version, task), tryNumber });
        return store.cacheGet(key) !== null;
      }).length
    : 0;
  // Until there's history, a first request's size and a guess at the reply.
  const guessed = estimateTokens(firstRequest(version, tasks[0])) * 1.5;
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const budget = estimateBudget({
    triesLeft: remaining.length,
    cachedTries,
    callsPerTry: store.averageCallsPerTry() ?? 4,
    usagePerCall: store.averageUsagePerCall() ?? { inputTokens: guessed, cachedInputTokens: 0, outputTokens: 0 },
    providers: config.agent.pool.map((m) => ({ provider: m.provider, limits: m.freeTierLimits, usedToday: store.usageSince(m.provider, dayAgo) })),
  });
  console.log(`\nBudget ${dim("(rough; \"today\" is the last 24 hours, by our own count)")}`);
  console.log(
    `  Agent pool:  ${remaining.length} tries to go, ${cachedTries} replayed from the cache · ` +
      `~${n(budget.calls)} calls, ~${compact(budget.countedTokens)} tokens`,
  );
  for (const p of budget.providers) {
    console.log(
      `    ${(labels.get(p.provider) ?? p.provider).padEnd(11)} left today ${compact(p.leftUnits)} of ${compact(p.allowance)} ${p.unit} · enough for ~${n(p.callsLeftToday)} calls`,
    );
  }
  if (!budget.fitsToday) {
    console.log(
      styleText(
        "yellow",
        `  Won't finish today. It stops cleanly when every provider is at its limit and \`${command}\` carries on; about ${budget.days} days in all.`,
      ),
    );
  }
  console.log(`  Gemini (judge): 0 calls · no model graders yet\n`);

  const clock = makeClock();
  // Each starts from what its provider still counts from calls in the last minute.
  for (const m of config.agent.pool) pacers.set(m.provider, new Pacer(m.freeTierLimits, clock, store.recentCalls(m.provider, Date.now() - 60_000)));
  const pool: PoolProvider[] = agents.map((a, i) => {
    const member = config.agent.pool[i];
    const pacer = pacers.get(a.provider);
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
  process.on("SIGINT", () => {
    if (interrupted) {
      progressLine.end();
      console.log(styleText("red", "Stopped at once. Tries in progress are lost and will be redone."));
      process.exit(130);
    }
    interrupted = true;
    progressLine.notice("Stopping: no new tries start; tries in progress are dropped and redone next time. Ctrl-C again to quit at once.");
    clock.wakeAll();
  });

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
        version,
      },
      tasks,
      concurrency: config.runner.concurrency,
      clock,
      describeError: (error) => (error instanceof Error ? error.message : String(error)),
      tracer: tracing.on ? tracing.tracerFor(run.id, runConfig) : null,
      stopRequested: () => interrupted,
      onNotice: (message) => progressLine.notice(message),
      onProgress: (p) => progressLine.update(p),
    });
  } catch (error) {
    progressLine.end();
    if (tracing.on) await tracing.shutdown();
    store.close();
    // Something in our own code broke (a grader, the store). The tries saved
    // so far are kept; nothing is counted from the one that broke.
    fatal(`The run crashed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  }
  progressLine.end();

  const trials = store.loadTrials(run.id);
  const passed = trials.filter((t) => t.status === "passed").length;
  const errored = trials.filter((t) => t.status === "errored").length;

  if (!outcome.finished) {
    console.log(styleText(["yellow", "bold"], `\n■ Stopped: ${outcome.message}`));
    console.log(`  ${trials.length} of ${total} tries done (${passed} passed so far). Nothing is lost; finished tries are saved and never redone.`);
    console.log(`  To carry on: ${styleText("bold", command)}${outcome.reason === "daily" ? " (after the limit resets)" : ""}`);
    if (outcome.reason === "config") console.log("  Fix the problem above first.");
    process.exitCode = 1;
  } else {
    const finishedAt = new Date().toISOString();
    store.finishRun(run.id, finishedAt);
    const dir = writeResults({ ...run, status: "finished", finishedAt }, trials, finishedAt, redact);
    if (smoke) {
      console.log(`\n${styleText("bold", `Smoke run finished: ${passed} of ${trials.length} tries passed, ${errored} errored.`)}`);
      console.log(dim("  This checks the machinery works. It's not a score: use `pnpm eval` for that."));
    } else {
      const rate = ((passed / trials.length) * 100).toFixed(1);
      console.log(`\n${styleText("bold", `Success rate: ${passed}/${trials.length} tries = ${rate}%`)}`);
      console.log(dim(`  ${tasks.length} dev tasks × ${runConfig.triesPerTask} tries. Errored tries count as not passed. No error bar yet, so read this as rough.`));
      if (errored > 0) console.log(styleText(["yellow", "bold"], `⚠ ${errored} tries errored. They count as not passed, so this rate understates the agent.`));
    }
    console.log(dim(`  Results: ${relative(PROJECT_ROOT, dir)}/ · open the runs page with \`pnpm dev\``));
  }

  if (tracing.on) await tracing.shutdown();
  store.close();
}

void main();
