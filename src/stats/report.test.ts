import { describe, expect, it } from "vitest";
import { compareRuns, measureNoise, runStats, widestNoise, type NoiseSlice, type OutcomeRow } from "./report";

// Tries for one task: `passes` of `tries` passed.
const tries = (taskId: string, category: OutcomeRow["category"], passes: number, tries = 4): OutcomeRow[] =>
  Array.from({ length: tries }, (_, i) => ({ taskId, category, difficulty: "easy", tryNumber: i + 1, passed: i < passes }));

describe("run stats", () => {
  it("splits by category, only for categories the run has", () => {
    const s = runStats([...tries("a", "refund", 4), ...tries("b", "cancel", 0)]);
    expect(s.overall.passHat[0].value).toBe(0.5);
    expect(Object.keys(s.byCategory).sort()).toEqual(["cancel", "refund"]);
    expect(s.byCategory.refund?.passHat[3].value).toBe(1);
    expect(s.byDifficulty.hard).toBeUndefined();
  });
});

describe("noise", () => {
  it("counts flips and the floor per category", () => {
    const a = [...tries("a", "refund", 4), ...tries("b", "cancel", 2)];
    const b = [...tries("a", "refund", 4), ...tries("b", "cancel", 3)];
    const noise = measureNoise(a, b);
    // Only b's third try changed: 1 of 8.
    expect(noise.overall).toMatchObject({ tasks: 2, outcomes: 8, flips: 1 });
    expect(noise.byCategory.refund?.floor).toBe(0);
    // One task moved 0.25: 1.96 × 0.25 / 1.
    expect(noise.byCategory.cancel?.floor).toBeCloseTo(0.49, 12);
  });
});

describe("widest noise", () => {
  const slice = (floor: number): NoiseSlice => ({ tasks: 7, outcomes: 28, flips: 1, flipRate: 1 / 28, floor });

  it("takes the wider floor for each slice on its own", () => {
    const x = { overall: slice(0.1), byCategory: { refund: slice(0.3), cancel: slice(0.05) } };
    const y = { overall: slice(0.2), byCategory: { cancel: slice(0.15), status: slice(0.4) } };
    const n = widestNoise([x, y]);
    expect(n?.overall.floor).toBe(0.2);
    // refund is wider in the narrower configuration, and kept.
    expect(n?.byCategory).toEqual({ refund: slice(0.3), cancel: slice(0.15), status: slice(0.4) });
    expect(n?.byCategory.address).toBeUndefined();
  });

  it("is null with nothing measured", () => {
    expect(widestNoise([])).toBeNull();
  });
});

describe("compare", () => {
  const a = [...tries("a", "refund", 0), ...tries("b", "refund", 0), ...tries("c", "cancel", 4), ...tries("old", "cancel", 4)];
  const b = [...tries("a", "refund", 4), ...tries("b", "refund", 4), ...tries("c", "cancel", 4), ...tries("new", "cancel", 0)];

  it("compares only shared tasks and lists the rest", () => {
    const c = compareRuns(a, b, null);
    expect(c.sharedTasks).toBe(3);
    expect(c.onlyInA).toEqual(["old"]);
    expect(c.onlyInB).toEqual(["new"]);
    expect(c.overall.difference.value).toBeCloseTo(2 / 3, 12);
    expect(c.overall.verdict).toBe("no-noise-floor");
  });

  it("judges each category against its own floor", () => {
    const noise = {
      overall: { tasks: 3, outcomes: 12, flips: 0, flipRate: 0, floor: 0.05 },
      byCategory: { refund: { tasks: 2, outcomes: 8, flips: 0, flipRate: 0, floor: 2 } },
    };
    const c = compareRuns(a, b, noise);
    // Two tasks flipping is too few for McNemar to clear 0.05 (p = 0.5).
    expect(c.overall.mcnemar).toEqual({ onlyA: 0, onlyB: 2, p: 0.5 });
    expect(c.overall.verdict).toBe("within-noise");
    expect(c.byCategory.refund?.floor).toBe(2);
    // No floor measured for cancel: no verdict there.
    expect(c.byCategory.cancel?.verdict).toBe("no-noise-floor");
  });
});
