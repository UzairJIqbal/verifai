// Which failed try you review next, read from the results files. Only failed
// tries from finished dev runs that aren't smoke runs: a holdout try is never
// offered, and an errored one didn't fail on the agent's own account.
import { listRuns, readRun } from "../results/read";
import type { Trial } from "../results/schema";
import { byReviewOrder } from "./order";
import { trialKey, type Note, type TrialRef } from "./schema";

export type Reviewable = TrialRef & { datasetVersion: string; trial: Trial };

export type ReviewPool = { trials: Reviewable[]; problems: string[] };

export function reviewPool(): ReviewPool {
  const { runs, problems } = listRuns();
  const trials: Reviewable[] = [];
  for (const report of runs) {
    if (report.split !== "dev" || report.smoke) continue;
    let files;
    try {
      files = readRun(report.runId);
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
      continue;
    }
    if (files === null || files.split !== "dev") continue;
    for (const t of files.trials) {
      if (t.status === "failed") trials.push({ runId: report.runId, taskId: t.taskId, tryNumber: t.tryNumber, datasetVersion: report.datasetVersion, trial: t });
    }
  }
  trials.sort(byReviewOrder);
  return { trials, problems };
}

export const nextToReview = (pool: ReviewPool, notes: Note[]): Reviewable | null => {
  const done = new Set(notes.map(trialKey));
  return pool.trials.find((t) => !done.has(trialKey(t))) ?? null;
};
