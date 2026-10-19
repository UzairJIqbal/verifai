// `pnpm task:new <run> <task> <try>`: turns a reviewed dev failure into a
// draft regression task under evals/drafts/, for you to finish by hand. Only
// a dev try with a review note qualifies. Spends nothing.
import { relative } from "node:path";
import { styleText } from "node:util";
import { PROJECT_ROOT } from "../src/config";
import { dim, fatal } from "../src/eval/session";
import { devTrials, readRun } from "../src/results/read";
import { readNotes, readTags } from "../src/review/files";
import { trialKey } from "../src/review/schema";
import { makeDraft, writeDraft } from "../src/tasks/draft";
import { loadTasks, nextTaskId } from "../src/tasks/load";

const USAGE = "Usage: pnpm task:new <run> <task> <try>   (a dev failure you've reviewed, e.g. pnpm task:new 20261015-0912-ab12 refund-04 2)";

function main(): void {
  const args = process.argv.slice(2);
  if (args.length !== 3 || !/^\d+$/.test(args[2])) fatal(USAGE);
  const ref = { runId: args[0], taskId: args[1], tryNumber: Number(args[2]) };
  try {
    const files = readRun(ref.runId);
    if (files === null) fatal(`There's no run ${ref.runId} under results/.`);
    const trials = devTrials(files);
    if (trials === null) fatal(`${ref.runId} isn't a dev run. Regression tasks only ever come from dev failures.`);
    const trial = trials.find((t) => t.taskId === ref.taskId && t.tryNumber === ref.tryNumber);
    if (!trial) fatal(`${ref.runId} has no try ${ref.taskId} #${ref.tryNumber}.`);
    if (trial.status === "passed") fatal(`${ref.taskId} #${ref.tryNumber} passed. A regression task comes from a failure.`);

    const notes = readNotes();
    const note = notes.find((n) => trialKey(n) === trialKey(ref));
    if (!note) fatal(`${trialKey(ref)} has no review note. Review it on the review page first (\`pnpm dev\`, then /review).`);
    const tag = readTags(notes).filter((t) => trialKey(t) === trialKey(ref)).at(-1);

    const source = loadTasks().tasks.find((t) => t.id === ref.taskId);
    if (!source) fatal(`${ref.taskId} isn't a dev task in the current dataset.`);
    const id = nextTaskId(source.category);
    const path = writeDraft(
      makeDraft(source, id, { ...ref, datasetVersion: files.report.datasetVersion, failureCategory: tag?.category ?? null, reviewNote: note.note }),
    );
    console.log(styleText("green", `✓ Draft ${id} written to ${relative(PROJECT_ROOT, path)}, copied from ${source.id}.`));
    console.log(dim("  Finish it by hand: write the note, ask in new words (first_message), and set expected and reference to match."));
    console.log(dim(`  Then \`pnpm task:add ${id}\` checks it, shows near-duplicates and adds it to dev (a new dataset version).`));
  } catch (error) {
    fatal(error instanceof Error ? error.message : String(error));
  }
}

main();
