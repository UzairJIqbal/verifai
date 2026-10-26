// `pnpm redo-no-answer <runId>`: drops the tries of a run that were saved as
// errored only because a model call got no answer (no Wi-Fi, a DNS failure, a
// connection or step timeout), so carrying the run on redoes them. Runs made
// since D-003 never save such tries; this is for the ones saved before it.
// An unfinished run just loses those tries. A finished noise run is reopened
// with its measurement, so `pnpm noise` redoes them and saves a new floor.
// No model is called here.
import { styleText } from "node:util";
import { loadConfig } from "../src/config";
import { poolSecrets, wasNoAnswer } from "../src/agent/model";
import { makeRedactor } from "../src/eval/redact";
import { ask, dim, fatal } from "../src/eval/session";
import { EVAL_STORE_PATH, EvalStore } from "../src/eval/store";
import { langfuseSecrets } from "../src/eval/tracing";
import { judgeSecrets } from "../src/judge/model";
import { readNoiseFloors } from "../src/results/read";
import { tasksHash } from "../src/eval/plan";
import { loadTasks } from "../src/tasks/load";

const USAGE = "Usage: pnpm redo-no-answer <runId>   (run ids are the folder names under results/)";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 1) fatal(USAGE);
  const runId = args[0];

  const config = loadConfig();
  const redact = makeRedactor([...poolSecrets(config), ...judgeSecrets(config.judge), ...langfuseSecrets()]);
  const store = new EvalStore(EVAL_STORE_PATH, redact);
  function stop(message: string): never {
    store.close();
    fatal(message);
  }

  const run = store.getRun(runId) ?? stop(`There's no run ${runId} in the eval store. The runs page lists them.`);
  // Carrying a run on needs the tasks it ran on.
  const loaded = loadTasks();
  if (loaded.version !== run.config.datasetVersion || (run.config.split === "dev" && tasksHash(loaded.tasks) !== run.config.tasksHash)) {
    stop(`${runId} ran on dataset ${run.config.datasetVersion}, and the tasks are now ${loaded.version}, so nothing could carry it on. It's left as it is.`);
  }
  const dropping = store.loadTrials(runId).filter((t) => t.status === "errored" && t.error !== null && wasNoAnswer(t.error));
  if (dropping.length === 0) {
    console.log(`No try of ${runId} was saved as errored for a call that got no answer. Nothing to do.`);
    return void store.close();
  }

  // A finished run can only be carried on by the command that made it. Only
  // noise runs have one that picks a finished run back up: `pnpm noise`, by
  // its measurement.
  let reopen: { configKey: string; runA: string; runB: string } | null = null;
  if (run.status === "finished") {
    const { floors, problems } = readNoiseFloors();
    if (problems.length > 0) stop(`results/noise-floors.jsonl has problems, so ${runId}'s floor can't be checked:\n${problems.join("\n")}`);
    const floor = [...floors.values()].find((f) => f.runs.includes(runId));
    if (floor === undefined) {
      stop(`${runId} is finished and isn't one of the runs behind a current noise floor, so nothing would carry it on. Only unfinished runs and finished noise runs can be redone.`);
    }
    const under = store.noiseMeasurement(floor.configKey);
    if (under !== null) stop(`A noise measurement for ${floor.configKey} is already under way (${under.runA} and ${under.runB}). Finish it with \`pnpm noise\` first.`);
    reopen = { configKey: floor.configKey, runA: floor.runs[0], runB: floor.runs[1] };
  }

  console.log(styleText("bold", `VerifAI redo-no-answer · run ${runId} · 0 model calls`));
  console.log(`  ${dropping.length} ${dropping.length === 1 ? "try was" : "tries were"} saved as errored for a call that got no answer:`);
  for (const t of dropping) console.log(`    ${t.taskId} try ${t.tryNumber} · ${t.error}`);
  console.log(
    reopen === null
      ? `  They'll be removed; carrying the run on redoes them.`
      : `  They'll be removed and ${runId} reopened with its noise measurement. Then \`pnpm noise\` redoes them and saves a new floor from ${reopen.runA} and ${reopen.runB}.`,
  );
  console.log(dim("  Errored tries where the model did answer are kept as they are: they count as fails."));

  if (!process.stdin.isTTY) stop("pnpm redo-no-answer asks before changing the store, so run it in a terminal.");
  if (!(await ask("Remove them? [y/N] "))) {
    console.log("Nothing changed.");
    return void store.close();
  }
  store.dropTries(runId, dropping);
  if (reopen !== null) {
    store.reopenRun(runId);
    store.saveNoiseMeasurement(reopen);
  }
  store.close();
  console.log(`Removed ${dropping.length}. ${reopen === null ? "Carry the run on with the command that started it." : "Next: `pnpm noise`."}`);
}

void main();
