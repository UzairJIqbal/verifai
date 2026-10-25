// Whether a candidate passes. Pure: two comparisons in, a verdict with its
// reasons out.
import type { Comparison } from "../stats/report";
import { CATEGORIES } from "../tasks/schema";

export type GateCheck = { id: string; label: string; pass: boolean; detail: string };
export type GateDecision = { pass: boolean; checks: GateCheck[] };

const pts = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}`;

/**
 * How many points a category may drop before the gate fails it: its own noise
 * floor on that split (already rescaled to its task count), but never less
 * than `minPoints`. A flat limit below the floor failed candidates on luck
 * (D-002). No floor means the minimum, the strict side.
 */
export function categoryDropLimit(floor: number | null, minPoints: number): number {
  return floor === null || Number.isNaN(floor) ? minPoints : Math.max(minPoints, floor * 100);
}

/**
 * Passes only if holdout success is better (bigger than the noise floor,
 * McNemar agrees, the interval clears zero) and no category, on dev or on
 * holdout, drops by more than its limit (`categoryDropLimit`, at least
 * `maxDropPoints`). Both comparisons are promoted (A) against candidate (B)
 * on the same tasks.
 */
export function decideGate(args: { dev: Comparison; holdout: Comparison; maxDropPoints: number }): GateDecision {
  const { dev, holdout, maxDropPoints } = args;
  const checks: GateCheck[] = [];

  for (const [split, c] of [["dev", dev], ["holdout", holdout]] as const) {
    const unmatched = c.onlyInA.length + c.onlyInB.length;
    checks.push({
      id: `${split}-same-tasks`,
      label: `${split}: both versions ran the same tasks`,
      pass: unmatched === 0 && c.sharedTasks > 0,
      detail: unmatched === 0 ? `${c.sharedTasks} tasks` : `${unmatched} tasks in only one run: ${[...c.onlyInA, ...c.onlyInB].join(", ")}`,
    });
  }

  const h = holdout.overall;
  const floor = h.floor === null || Number.isNaN(h.floor) ? "no floor" : `floor ${(h.floor * 100).toFixed(1)}`;
  checks.push({
    id: "holdout-better",
    label: "holdout success improves beyond the noise floor, and McNemar agrees",
    pass: h.verdict === "better",
    detail: `${pts(h.difference.value)} points [${pts(h.difference.lo)}, ${pts(h.difference.hi)}] · ${floor} · McNemar p ${h.mcnemar.p < 0.001 ? "< 0.001" : h.mcnemar.p.toFixed(3)} · ${h.verdict}`,
  });

  for (const [split, c] of [["dev", dev], ["holdout", holdout]] as const) {
    for (const category of CATEGORIES) {
      const row = c.byCategory[category];
      if (row === undefined) continue;
      const drop = -row.difference.value * 100;
      const limit = categoryDropLimit(row.floor, maxDropPoints);
      const from = limit > maxDropPoints ? "its noise floor" : `the ${maxDropPoints}-point minimum`;
      checks.push({
        id: `${split}-${category}`,
        label: `${split} ${category}: drops no more than ${limit.toFixed(1)} points`,
        // A hair of float error mustn't fail a drop of exactly the limit.
        pass: drop <= limit + 1e-9,
        detail: `${pts(row.difference.value)} points on ${row.tasks} tasks (${(row.aRate * 100).toFixed(1)}% → ${(row.bRate * 100).toFixed(1)}%) · limit from ${from}`,
      });
    }
  }
  return { pass: checks.every((c) => c.pass), checks };
}
