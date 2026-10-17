// Picking a finished run to work on again (`pnpm regrade`, `pnpm claims`),
// and the checks that it's still safe to: a dev run, not a smoke run, and
// graded against the same tasks it ran on.
import { tasksHash } from "./plan";
import { fatal } from "./session";
import type { EvalStore, StoredRun } from "./store";
import { loadTasks } from "../tasks/load";
import type { Task } from "../tasks/schema";

// `verb` reads "No finished dev runs to <verb>", `past` "it's never <past>".
export function pickFinishedRun(store: EvalStore, id: string | undefined, verb: string, past: string): { run: StoredRun & { finishedAt: string }; tasksById: Map<string, Task> } {
  let run: StoredRun | undefined;
  if (id !== undefined) {
    run = store.getRun(id) ?? undefined;
    if (run === undefined) fatal(`There's no run ${id} in the eval store. The runs page lists them.`);
  } else {
    run = store.finishedRuns().find((r) => r.config.split === "dev" && !r.config.smoke);
    if (run === undefined) fatal(`No finished dev runs to ${verb}. Run \`pnpm eval\` first.`);
  }
  if (run.config.split === "holdout") fatal(`${run.id} is a holdout run. It's graded once, by the gate, and never ${past}.`);
  if (run.config.smoke) fatal(`${run.id} is a smoke run. It checks the machinery and has no report; ${verb} a full \`pnpm eval\` run.`);
  if (run.status !== "finished" || run.finishedAt === null) fatal(`${run.id} hasn't finished. \`pnpm eval\` carries it on.`);

  const loaded = loadTasks();
  if (loaded.version !== run.config.datasetVersion) {
    fatal(`${run.id} was run on dataset ${run.config.datasetVersion}, and the tasks are now ${loaded.version}. It can only be ${past} against the tasks it ran on.`);
  }
  if (tasksHash(loaded.tasks) !== run.config.tasksHash) {
    fatal(`The dev tasks have changed since ${run.id} ran, without a new dataset version. Bump the version in evals/tasks.jsonl; this run can't be ${past}.`);
  }
  return { run: { ...run, finishedAt: run.finishedAt }, tasksById: new Map(loaded.tasks.map((t) => [t.id, t])) };
}
