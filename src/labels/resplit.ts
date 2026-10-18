// Redrawing the judge split, stratified by the labels: tasks with a failed
// criterion, tasks with only a claim that isn't supported, and tasks where
// everything passed are each split in half on their own, so both sides hold
// failing tries. Still by whole task. Strata come from the labels, never the
// judges' verdicts: choosing by the judge would bias its own TPR. Each
// stratum moves only as many tasks as it needs to be even: a judge-dev task
// moved to judge-test brings verdicts already seen, so the fewer the better.
// Pure.
import { createHash } from "node:crypto";
import type { JudgeSplit, Label, Resplit } from "./schema";

export const STRATA = ["a criterion fails", "only a claim fails", "everything passes"] as const;

function stratumOf(labels: Label[]): (typeof STRATA)[number] {
  if (labels.some((l) => l.criteria.some((c) => !c.pass))) return STRATA[0];
  if (labels.some((l) => l.claims.some((c) => c.label !== "supported"))) return STRATA[1];
  return STRATA[2];
}

const draw = (taskId: string) => createHash("sha256").update(`verifai judge resplit:${taskId}`).digest("hex");

export function stratifiedSplit(labels: Label[], at: string, reason: string): { sides: Map<string, JudgeSplit>; record: Resplit } {
  const byTask = Map.groupBy(labels, (l) => l.taskId);
  const before = new Map([...byTask].map(([t, ls]) => [t, ls[0].split]));
  const sides = new Map(before);
  const strata: Resplit["strata"] = [];
  for (const name of STRATA) {
    const tasks = [...byTask].filter(([, ls]) => stratumOf(ls) === name).map(([t]) => t);
    const onSide = (s: JudgeSplit) => tasks.filter((t) => before.get(t) === s).sort((a, b) => (draw(a) < draw(b) ? -1 : 1));
    const test = onSide("judge-test").length;
    // Even means judge-test holds floor(n/2) to ceil(n/2); moved tasks are the first in a fixed random order.
    const low = Math.floor(tasks.length / 2);
    const high = Math.ceil(tasks.length / 2);
    if (test < low) onSide("judge-dev").slice(0, low - test).forEach((t) => sides.set(t, "judge-test"));
    if (test > high) onSide("judge-test").slice(0, test - high).forEach((t) => sides.set(t, "judge-dev"));
    const after = tasks.filter((t) => sides.get(t) === "judge-test").length;
    strata.push({ name, tasks: tasks.length, test: after, dev: tasks.length - after });
  }
  const moved = (from: JudgeSplit, to: JudgeSplit) => [...sides].filter(([t, s]) => s === to && before.get(t) === from).map(([t]) => t).sort();
  return { sides, record: { at, reason, strata, seenInDev: moved("judge-dev", "judge-test"), movedToDev: moved("judge-test", "judge-dev") } };
}
