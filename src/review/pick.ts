// Which failed try you review next, read from the results files. Only failed
// tries from finished dev runs that aren't smoke runs: a holdout try is never
// offered, and an errored one didn't fail on the agent's own account.
// Flagged online conversations come too, ahead of them: they're dev-side.
import { listBatches, readBatch } from "../online/files";
import type { Persona } from "../online/schema";
import { conversationTrial } from "../online/trial";
import { devTrials, listRuns, readRun } from "../results/read";
import type { Trial } from "../results/schema";
import { byReviewOrder } from "./order";
import { trialKey, type Note, type TrialRef } from "./schema";

// `online` is set for a flagged online conversation: why it was flagged.
export type Reviewable = TrialRef & { datasetVersion: string; trial: Trial; online?: { flags: string[]; persona: Persona } };

// Newest batch first, so what's flagged lately is read first; within a batch,
// the same fixed random order as the tries.
function onlinePool(problems: string[]): Reviewable[] {
  const listing = listBatches();
  problems.push(...listing.problems);
  const out: Reviewable[] = [];
  for (const batch of [...listing.batches].reverse()) {
    let files;
    try {
      files = readBatch(batch.batchId);
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
      continue;
    }
    if (files === null) continue;
    const flagged = files.conversations
      .filter((c) => c.flags.length > 0)
      .map((c): Reviewable => ({
        runId: batch.batchId,
        taskId: c.templateId,
        tryNumber: c.number,
        datasetVersion: batch.datasetVersion,
        trial: conversationTrial(c),
        online: { flags: c.flags, persona: c.persona },
      }));
    out.push(...flagged.sort(byReviewOrder));
  }
  return out;
}

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
    const devTries = devTrials(files);
    if (devTries === null) continue;
    for (const t of devTries) {
      if (t.status === "failed") trials.push({ runId: report.runId, taskId: t.taskId, tryNumber: t.tryNumber, datasetVersion: report.datasetVersion, trial: t });
    }
  }
  trials.sort(byReviewOrder);
  return { trials: [...onlinePool(problems), ...trials], problems };
}

export const nextToReview = (pool: ReviewPool, notes: Note[]): Reviewable | null => {
  const done = new Set(notes.map(trialKey));
  return pool.trials.find((t) => !done.has(trialKey(t))) ?? null;
};
