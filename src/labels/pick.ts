// Which trial you label next, read from the results files. Only finished dev
// runs that aren't smoke runs, and only trials both judges have read with the
// rubric now in the config: a holdout trial is never shown here, and a trial
// the judge couldn't read has no verdict to agree with.
import { createHash } from "node:crypto";
import { devTrials, listRuns, readRun } from "../results/read";
import type { Trial } from "../results/schema";
import { readLabels, recordSnapshots, type LabelFiles, LABEL_FILES } from "./files";
import { trialKey, type Label, type TrialRef } from "./schema";

export type Labellable = TrialRef & { trial: Trial };

export type Pool = {
  // Every trial that can be labelled, in the order they're offered.
  trials: Labellable[];
  // Dev runs whose tries haven't been read by both judges with this rubric.
  waiting: { runId: string; reason: string }[];
  problems: string[];
};

export const isLabellable = (t: Trial, rubricVersion: string): boolean =>
  t.status !== "errored" && t.judge?.status === "judged" && t.judge.rubricVersion === rubricVersion && t.claims?.status === "checked";

// The order is a fixed hash of each trial's id: random, but the same every
// time, so reloading the page offers the same trial. Nothing about a trial
// can make it come up sooner, and there's no skipping to a nicer one.
const orderKey = (t: TrialRef) => createHash("sha256").update(`verifai labelling order:${trialKey(t)}`).digest("hex");

export function labellingPool(rubricVersion: string): Pool {
  const { runs, problems } = listRuns();
  const trials: Labellable[] = [];
  const waiting: Pool["waiting"] = [];
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
    const ready = devTries.filter((t) => isLabellable(t, rubricVersion));
    if (ready.length === 0) {
      const judgedOther = devTries.some((t) => t.judge?.status === "judged" && t.judge.rubricVersion !== rubricVersion);
      waiting.push({
        runId: report.runId,
        reason: judgedOther ? `judged with another rubric; \`pnpm judge ${report.runId}\` judges it with ${rubricVersion}` : `\`pnpm claims ${report.runId}\` and \`pnpm judge ${report.runId}\` haven't both read it`,
      });
    }
    for (const t of ready) trials.push({ runId: report.runId, taskId: t.taskId, tryNumber: t.tryNumber, trial: t });
  }
  trials.sort((a, b) => (orderKey(a) < orderKey(b) ? -1 : 1));
  return { trials, waiting, problems };
}

export const nextToLabel = (pool: Pool, labels: Label[]): Labellable | null => {
  const done = new Set(labels.map(trialKey));
  return pool.trials.find((t) => !done.has(trialKey(t))) ?? null;
};

// Before `pnpm judge` or `pnpm claims` rewrite a run, what the judges said
// about its labelled trials is copied out, so a new rubric doesn't erase the
// old verdicts the report compares it with.
export function snapshotLabelledTrials(runId: string, now: Date, files: LabelFiles = LABEL_FILES): number {
  const labelled = new Set(readLabels(files).filter((l) => l.runId === runId).map(trialKey));
  if (labelled.size === 0) return 0;
  const devTries = devTrials(readRun(runId));
  if (devTries === null) return 0;
  const trials = devTries.filter((t) => labelled.has(trialKey({ runId, ...t })));
  return recordSnapshots(trials.map((t) => ({ runId, taskId: t.taskId, tryNumber: t.tryNumber, judge: t.judge, claims: t.claims })), now, files);
}
