// `pnpm eval`: every dev task, 4 tries each, a few at a time, every step saved.
// Stops cleanly at the daily limit (or Ctrl-C); running it again carries the
// same run on from the next unfinished try. The holdout is never loaded here.
//
//   pnpm eval                   run, replaying any call already in the cache
//   pnpm eval --no-cache        send every call afresh
//   pnpm eval --smoke           only runner.smokeTasks, one dev task per category:
//                               checks the machinery, never a score
//   pnpm eval --replay [runId]  replay the recorded trajectories of a committed
//                               dev run and re-grade them with no key; checks
//                               they match its report. The agent doesn't run.
import { relative } from "node:path";
import { parseArgs, styleText } from "node:util";
import { PROJECT_ROOT } from "../src/config";
import { loadPolicy } from "../src/agent/versions";
import { replayRunFiles } from "../src/eval/replay";
import { dim, executeRun, fatal, openSession, printReport } from "../src/eval/session";
import { listRuns, readRun } from "../src/results/read";
import { RESULTS_DIR } from "../src/results/write";
import { loadTasks } from "../src/tasks/load";

const USAGE = "Usage: pnpm eval [--smoke] [--no-cache]\n       pnpm eval --replay [runId]   (run ids are the folder names under results/)";

type Flags = { mode: "run"; useCache: boolean; smoke: boolean } | { mode: "replay"; runId: string | undefined };

function parseFlags(): Flags {
  try {
    const { values, positionals } = parseArgs({
      options: {
        "no-cache": { type: "boolean", default: false },
        smoke: { type: "boolean", default: false },
        replay: { type: "boolean", default: false },
      },
      allowPositionals: true,
      strict: true,
    });
    if (values.replay) {
      if (values.smoke || values["no-cache"]) throw new Error("--replay calls no model, so --smoke and --no-cache don't go with it.");
      if (positionals.length > 1) throw new Error("--replay takes at most one run id.");
      return { mode: "replay", runId: positionals[0] };
    }
    if (positionals.length > 0) throw new Error(`Unexpected argument "${positionals[0]}". Only --replay takes a run id.`);
    return { mode: "run", useCache: !values["no-cache"], smoke: values.smoke };
  } catch (error) {
    fatal(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
  }
}

// Reads only the committed files and the seeded shop: no eval store, no
// config secrets, nothing written. A try graded differently from its file
// means the committed number can't be reproduced, so that exits 1.
function replay(runId: string | undefined): void {
  try {
    let id = runId;
    if (id === undefined) {
      const { runs, problems } = listRuns();
      for (const problem of problems) console.log(styleText("yellow", `  Skipped: ${problem}`));
      id = runs.find((r) => r.split === "dev" && !r.smoke)?.runId;
      if (id === undefined) fatal("No finished dev run in results/ to replay. Run `pnpm eval` first, or pass a run id.");
    }
    const files = readRun(id);
    if (files === null) fatal(`There's no run ${id} in results/. The folder names there are the run ids.`);
    const where = `${relative(PROJECT_ROOT, RESULTS_DIR)}/${id}/`;

    console.log(styleText("bold", `VerifAI replay · run ${id} · dataset ${files.report.datasetVersion} · 0 model calls`));
    console.log(dim(`  from ${where} · tool calls run again on a fresh shop · code graders run again · claim checks and judge verdicts as recorded`));
    const { report, differences } = replayRunFiles(files, loadTasks(), { policy: loadPolicy() });
    printReport(report);

    if (differences.length === 0) {
      console.log(styleText("green", `\n✓ Matches ${where}: every try graded the same as its file.`));
      return;
    }
    console.log(styleText(["yellow", "bold"], `\n✗ ${differences.length} tries graded differently from ${where}, so its report can't be reproduced:`));
    for (const d of differences.slice(0, 10)) {
      console.log(`  ${d.taskId} try ${d.tryNumber}\n${dim(`    file:   ${d.recorded}\n    replay: ${d.replayed}`)}`);
    }
    if (differences.length > 10) console.log(dim(`  … and ${differences.length - 10} more.`));
    console.log(dim("  A grader changed since the run. `pnpm regrade` rewrites the run with today's graders."));
    process.exitCode = 1;
  } catch (error) {
    fatal(error instanceof Error ? error.message : String(error));
  }
}

async function main(): Promise<void> {
  const flags = parseFlags();
  if (flags.mode === "replay") return replay(flags.runId);
  const { useCache, smoke } = flags;
  const command = ["pnpm eval", smoke ? "--smoke" : "", useCache ? "" : "--no-cache"].filter(Boolean).join(" ");
  const session = await openSession({ useCache, smoke });
  const outcome = await executeRun(session, { title: smoke ? "smoke run" : "eval", command });
  if (!outcome.finished) process.exitCode = 1;
  await session.close();
}

void main();
