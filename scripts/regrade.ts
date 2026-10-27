// `pnpm regrade [runId]`: grades a finished run's recorded tries again with
// today's graders, and rewrites its results. No model is called: the tool
// calls are replayed on a fresh shop to rebuild what each try changed, and a
// replay that comes out different from the recording stops everything. The
// claim checker's labels are kept as they are; `pnpm claims` renews them.
// With no run id, the newest finished dev run that isn't a smoke run.
import { relative } from "node:path";
import { styleText } from "node:util";
import { loadConfig, PROJECT_ROOT } from "../src/config";
import { poolSecrets } from "../src/agent/model";
import { loadPolicy, loadToolDescriptions, offeredTools, preCheckNamed } from "../src/agent/versions";
import { pickFinishedRun } from "../src/eval/finished-run";
import { replayTrial } from "../src/eval/replay";
import { makeRedactor } from "../src/eval/redact";
import { dim, fatal, printReport } from "../src/eval/session";
import { EVAL_STORE_PATH, EvalStore } from "../src/eval/store";
import { langfuseSecrets } from "../src/eval/tracing";
import { judgeSecrets } from "../src/judge/model";
import { gradeTry, outcomePassed } from "../src/graders";
import { readShopFacts } from "../src/graders/shop-facts";
import { writeResults } from "../src/results/write";
import { getShopToday, openFreshShop } from "../src/shop/db";

const USAGE = "Usage: pnpm regrade [runId]   (run ids are the folder names under results/)";

function main(): void {
  const args = process.argv.slice(2);
  if (args.length > 1) fatal(USAGE);

  const config = loadConfig();
  const redact = makeRedactor([...poolSecrets(config), ...judgeSecrets(config.judge), ...langfuseSecrets()]);
  const store = new EvalStore(EVAL_STORE_PATH, redact);
  try {
    const { run, tasksById } = pickFinishedRun(store, args[0], "regrade", "regraded");
    const policy = loadPolicy();

    const seed = openFreshShop();
    const shop = readShopFacts(seed.db, getShopToday(seed.db));
    seed.dispose();

    console.log(styleText("bold", `VerifAI regrade · run ${run.id} · dataset ${run.config.datasetVersion} · 0 model calls`));
    const trials = store.loadTrials(run.id);
    let changed = 0;
    let errored = 0;
    // Everything is graded before anything is written: one try that can't be
    // replayed leaves the run exactly as it was.
    // Replayed with the tools and validation step the run's agent had, so a
    // call its version left out or refused fails again, as it did in the run.
    const offered = offeredTools(loadToolDescriptions(run.config.toolDescriptionsVersion));
    const preCheck = preCheckNamed(run.config.validation ?? null);
    const regraded = trials.flatMap((trial) => {
      // An errored try never finished, so there's nothing to grade.
      if (trial.status === "errored") {
        errored++;
        return [];
      }
      const task = tasksById.get(trial.taskId);
      if (!task) throw new Error(`${run.id} has tries of ${trial.taskId}, which isn't a dev task.`);
      const verdicts = gradeTry(task, replayTrial(trial, offered, preCheck), shop, policy);
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
