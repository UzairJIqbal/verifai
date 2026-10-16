// `pnpm regrade [runId]`: grades a finished run's recorded tries again with
// today's graders, and rewrites its results. No model is called: the tool
// calls are replayed on a fresh shop to rebuild what each try changed, and a
// replay that comes out different from the recording stops everything.
// With no run id, the newest finished dev run that isn't a smoke run.
import { relative } from "node:path";
import { styleText } from "node:util";
import { canonical } from "../src/canonical";
import { loadConfig, PROJECT_ROOT } from "../src/config";
import { poolSecrets } from "../src/agent/model";
import { runTool } from "../src/agent/tools";
import { tasksHash } from "../src/eval/plan";
import { makeRedactor } from "../src/eval/redact";
import { dim, fatal, printReport } from "../src/eval/session";
import { EVAL_STORE_PATH, EvalStore, type StoredRun } from "../src/eval/store";
import { langfuseSecrets } from "../src/eval/tracing";
import type { Trajectory, TrajectoryEvent } from "../src/eval/trajectory";
import { gradeTry, outcomePassed } from "../src/graders";
import { readShopFacts } from "../src/graders/shop-facts";
import type { RecordedTrial, Step } from "../src/results/schema";
import { writeResults } from "../src/results/write";
import { getShopToday, openFreshShop } from "../src/shop/db";
import { diffShops, dumpShop } from "../src/shop/diff";
import { loadTasks } from "../src/tasks/load";
import type { Task } from "../src/tasks/schema";

const USAGE = "Usage: pnpm regrade [runId]   (run ids are the folder names under results/)";

// A recorded step is the event it was made from, with its cost added.
const toEvent = (s: Step): TrajectoryEvent => s;

// What the try left the shop looking like, from its own tool calls run again.
// Tools are deterministic over the seed and the frozen date, so a different
// outcome means the shop or a tool changed since the run, and its grades
// would be about something that never happened.
function replay(trial: RecordedTrial): Trajectory {
  const shop = openFreshShop();
  try {
    const ctx = { db: shop.db, today: getShopToday(shop.db) };
    const before = dumpShop(shop.db);
    const calls = new Map(trial.steps.flatMap((s) => (s.type === "tool-call" ? [[s.toolCallId, s] as const] : [])));
    for (const s of trial.steps) {
      if (s.type !== "tool-result") continue;
      const call = calls.get(s.toolCallId);
      if (!call) throw new Error(`${trial.taskId} try ${trial.tryNumber}: a ${s.toolName} result has no call.`);
      const outcome = runTool(ctx, call.toolName, call.input);
      if (canonical(outcome) !== canonical(s.outcome)) {
        throw new Error(
          `${trial.taskId} try ${trial.tryNumber}: replaying ${call.toolName} ${canonical(call.input)} gave ${canonical(outcome)}, but the run recorded ${canonical(s.outcome)}. ` +
            "The shop or a tool has changed since this run, so it can't be regraded. Run `pnpm eval` for a new one.",
        );
      }
    }
    if (trial.end === null) throw new Error(`${trial.taskId} try ${trial.tryNumber} has no end recorded.`);
    return { events: trial.steps.map(toEvent), end: trial.end, changes: diffShops(before, dumpShop(shop.db)) };
  } finally {
    shop.dispose();
  }
}

function pickRun(store: EvalStore, id: string | undefined): StoredRun {
  if (id !== undefined) {
    const run = store.getRun(id);
    if (run === null) fatal(`There's no run ${id} in the eval store. The runs page lists them.`);
    return run;
  }
  const run = store.finishedRuns().find((r) => r.config.split === "dev" && !r.config.smoke);
  if (!run) fatal("No finished dev runs to regrade. Run `pnpm eval` first.");
  return run;
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length > 1) fatal(USAGE);

  const config = loadConfig();
  const redact = makeRedactor([...poolSecrets(config), ...langfuseSecrets()]);
  const store = new EvalStore(EVAL_STORE_PATH, redact);
  try {
    const run = pickRun(store, args[0]);
    if (run.config.split === "holdout") fatal(`${run.id} is a holdout run. It's graded once, by the gate, and never regraded.`);
    if (run.config.smoke) fatal(`${run.id} is a smoke run. It checks the machinery and has no grader report; regrade a full \`pnpm eval\` run.`);
    if (run.status !== "finished" || run.finishedAt === null) fatal(`${run.id} hasn't finished. \`pnpm eval\` carries it on.`);

    const loaded = loadTasks();
    if (loaded.version !== run.config.datasetVersion) {
      fatal(`${run.id} was run on dataset ${run.config.datasetVersion}, and the tasks are now ${loaded.version}. It can only be regraded against the tasks it ran on.`);
    }
    if (tasksHash(loaded.tasks) !== run.config.tasksHash) {
      fatal(`The dev tasks have changed since ${run.id} ran, without a new dataset version. Bump the version in evals/tasks.jsonl; this run can't be regraded.`);
    }
    const tasksById = new Map<string, Task>(loaded.tasks.map((t) => [t.id, t]));

    const seed = openFreshShop();
    const shop = readShopFacts(seed.db, getShopToday(seed.db));
    seed.dispose();

    console.log(styleText("bold", `VerifAI regrade · run ${run.id} · dataset ${run.config.datasetVersion} · 0 model calls`));
    const trials = store.loadTrials(run.id);
    let changed = 0;
    let errored = 0;
    // Everything is graded before anything is written: one try that can't be
    // replayed leaves the run exactly as it was.
    const regraded = trials.flatMap((trial) => {
      // An errored try never finished, so there's nothing to grade.
      if (trial.status === "errored") {
        errored++;
        return [];
      }
      const task = tasksById.get(trial.taskId);
      if (!task) throw new Error(`${run.id} has tries of ${trial.taskId}, which isn't a dev task.`);
      const verdicts = gradeTry(task, replay(trial), shop);
      const status = outcomePassed(verdicts) ? ("passed" as const) : ("failed" as const);
      if (status !== trial.status) changed++;
      return [{ taskId: trial.taskId, tryNumber: trial.tryNumber, status, verdicts }];
    });
    store.replaceGrades(run.id, regraded);

    const written = writeResults(run, store.loadTrials(run.id), tasksById, run.finishedAt, redact);
    console.log(`  ${regraded.length} tries regraded${errored > 0 ? `, ${errored} errored tries left as they were` : ""}.`);
    console.log(changed === 0 ? "  No try changed between passed and failed." : styleText("yellow", `  ${changed} tries changed between passed and failed: the success rate moved.`));
    printReport(written.report);
    console.log(dim(`\n  Results: ${relative(PROJECT_ROOT, written.dir)}/ · open the run page with \`pnpm dev\``));
  } catch (error) {
    fatal(error instanceof Error ? error.message : String(error));
  } finally {
    store.close();
  }
}

main();
