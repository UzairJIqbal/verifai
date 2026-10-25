// The noise floor the gate judges against. Noise is measured on dev (holdout
// is never run twice for it), so the gate takes the newest floor measured for
// the same agent, on any dataset version, and rescales it to the number of
// tasks being compared.
import { createHash } from "node:crypto";
import { canonical } from "../canonical";
import type { RunConfig } from "../eval/store";
import type { NoiseFloor } from "../results/schema";
import type { Noise, NoiseSlice } from "../stats/report";
import { CATEGORIES, type Category } from "../tasks/schema";

// Everything about a run that's the agent, not the tasks: two runs with the
// same key ran the same agent, whatever dataset or split they ran it on.
export const agentKey = (c: RunConfig): string =>
  createHash("sha256")
    .update(canonical({ ...c, datasetVersion: null, split: null, tasksHash: null, useCache: null, smoke: null }))
    .digest("hex")
    .slice(0, 16);

export type FloorSource = { floor: NoiseFloor; runConfig: RunConfig };

/**
 * The newest floor whose runs ran this agent. `configOf` gives a measured
 * run's saved configuration (null if the store doesn't have it, and then that
 * floor can't be vouched for and isn't used).
 */
export function newestFloorFor(key: string, floors: NoiseFloor[], configOf: (runId: string) => RunConfig | null): FloorSource | null {
  let best: FloorSource | null = null;
  for (const floor of floors) {
    const runConfig = configOf(floor.runs[0]);
    if (runConfig === null || agentKey(runConfig) !== key) continue;
    if (best === null || floor.measuredAt > best.floor.measuredAt) best = { floor, runConfig };
  }
  return best;
}

/**
 * A floor measured on T tasks, for a comparison on T′. The floor is
 * 1.96·√(Σd²)/T, and Σd² grows with the number of tasks, so at the same
 * per-task wobble it scales by √(T/T′): fewer tasks, a wider floor. Each
 * category the same way, with its own counts. A category the measurement
 * didn't have gets no floor (and so no verdict).
 */
export function rescaleNoise(noise: Noise, counts: { overall: number; byCategory: Partial<Record<Category, number>> }): Noise {
  const scale = (s: NoiseSlice, to: number): NoiseSlice => ({ ...s, tasks: to, floor: s.tasks === 0 || to === 0 ? NaN : s.floor * Math.sqrt(s.tasks / to) });
  const byCategory: Partial<Record<Category, NoiseSlice>> = {};
  for (const c of CATEGORIES) {
    const measured = noise.byCategory[c];
    const to = counts.byCategory[c];
    if (measured !== undefined && to !== undefined && to > 0) byCategory[c] = scale(measured, to);
  }
  return { overall: scale(noise.overall, counts.overall), byCategory };
}
