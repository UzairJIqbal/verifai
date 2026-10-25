// Whether a candidate passes. Pure: two comparisons in, a verdict with its
// reasons out.
import type { Comparison, Noise } from "../stats/report";
import { CATEGORIES, type Category } from "../tasks/schema";

export type GateCheck = { id: string; label: string; pass: boolean; detail: string };
export type DropLimits = Record<"dev" | "holdout", Partial<Record<Category, number>>>;
// `dropLimits` are the limits the checks used, so the record saves exactly those.
export type GateDecision = { pass: boolean; checks: GateCheck[]; dropLimits: DropLimits };

const pts = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}`;

/**
 * How many points a category may drop before the gate fails it: the promoted
 * version's noise floor for it on that split (already rescaled to its task
 * count), but never less than `minPoints`. A flat limit below the floor failed
 * candidates on luck (D-002). No floor means the minimum, the strict side.
 * Rounded down to 0.1 points, so the limit shown is the limit applied and
 * rounding can only make it stricter.
 */
export function categoryDropLimit(floor: number | null, minPoints: number): number {
  if (floor === null || Number.isNaN(floor)) return minPoints;
  // The nudge keeps float error (16.7 stored as 16.6999…) from rounding a whole tenth away.
  return Math.max(minPoints, Math.floor(floor * 1000 + 1e-6) / 10);
}

/**
 * Passes only if holdout success is better (bigger than the noise floor,
 * McNemar agrees, the interval clears zero) and no category, on dev or on
 * holdout, drops by more than its limit (`categoryDropLimit`, at least
 * `maxDropPoints`). Both comparisons are promoted (A) against candidate (B)
 * on the same tasks.
 *
 * `promotedNoise` is the promoted version's floor rescaled to each split. The
 * limits come from it alone: the comparisons' floors are the wider of the two
 * versions', which is strict for an improvement but would let a noisy
 * candidate's own luck widen the room it's given to drop.
 */
export function decideGate(args: { dev: Comparison; holdout: Comparison; promotedNoise: Record<"dev" | "holdout", Noise>; maxDropPoints: number }): GateDecision {
  const { dev, holdout, promotedNoise, maxDropPoints } = args;
  const checks: GateCheck[] = [];
  const dropLimits: DropLimits = { dev: {}, holdout: {} };

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
      const floor = promotedNoise[split].byCategory[category]?.floor ?? null;
      const limit = categoryDropLimit(floor, maxDropPoints);
      dropLimits[split][category] = limit;
      const from =
        floor === null || Number.isNaN(floor)
          ? `the ${maxDropPoints}-point minimum (no noise floor measured for this category)`
          : limit > maxDropPoints
            ? "the promoted version's noise floor"
            : `the ${maxDropPoints}-point minimum`;
      checks.push({
        id: `${split}-${category}`,
        label: `${split} ${category}: drops no more than ${limit.toFixed(1)} points`,
        // A hair of float error mustn't fail a drop of exactly the limit.
        pass: drop <= limit + 1e-9,
        detail: `${pts(row.difference.value)} points on ${row.tasks} tasks (${(row.aRate * 100).toFixed(1)}% → ${(row.bRate * 100).toFixed(1)}%) · limit from ${from}`,
      });
    }
  }
  return { pass: checks.every((c) => c.pass), checks, dropLimits };
}
