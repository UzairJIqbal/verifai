import { describe, expect, it } from "vitest";
import {
  agreement,
  agreementEstimate,
  bootstrapMean,
  bootstrapRatio,
  comb,
  flipRate,
  majorityPassed,
  mcnemarExact,
  mcnemarOnTasks,
  noiseFloor,
  pairedDifference,
  passAtK,
  passEstimate,
  passHatK,
  seededRandom,
  verdict,
  type PairedOutcome,
  type TaskOutcome,
} from "./stats";

const task = (taskId: string, tries: number, successes: number): TaskOutcome => ({ taskId, tries, successes });

describe("comb", () => {
  it("matches hand-worked values", () => {
    expect(comb(4, 2)).toBe(6);
    expect(comb(4, 0)).toBe(1);
    expect(comb(4, 4)).toBe(1);
    expect(comb(2, 3)).toBe(0);
    expect(comb(50, 25)).toBe(126410606437752);
  });
});

describe("pass^k and pass@k", () => {
  // A task with 4 tries, 2 passed. Draw k of the 4 without replacement.
  it("works out a 2-of-4 task by hand", () => {
    expect(passHatK(4, 2, 1)).toBe(0.5);
    // Both draws pass: C(2,2)/C(4,2) = 1/6.
    expect(passHatK(4, 2, 2)).toBeCloseTo(1 / 6, 12);
    // Can't draw 3 passes from 2.
    expect(passHatK(4, 2, 3)).toBe(0);
    expect(passAtK(4, 2, 1)).toBe(0.5);
    // At least one passes: 1 − C(2,2)/C(4,2) = 5/6.
    expect(passAtK(4, 2, 2)).toBeCloseTo(5 / 6, 12);
    // 3 draws from 4 always include one of the 2 passes.
    expect(passAtK(4, 2, 3)).toBe(1);
  });

  it("works out a 3-of-4 task by hand", () => {
    // C(3,2)/C(4,2) = 3/6, C(3,3)/C(4,3) = 1/4, C(3,4) = 0.
    expect(passHatK(4, 3, 2)).toBe(0.5);
    expect(passHatK(4, 3, 3)).toBe(0.25);
    expect(passHatK(4, 3, 4)).toBe(0);
    // Only the one failure can be drawn alone.
    expect(passAtK(4, 3, 1)).toBe(0.75);
    expect(passAtK(4, 3, 2)).toBe(1);
  });

  it("is 1 for a task that always passes and 0 for one that never does", () => {
    for (let k = 1; k <= 4; k++) {
      expect(passHatK(4, 4, k)).toBe(1);
      expect(passAtK(4, 4, k)).toBe(1);
      expect(passHatK(4, 0, k)).toBe(0);
      expect(passAtK(4, 0, k)).toBe(0);
    }
  });

  it("never lets pass^k rise or pass@k fall as k grows", () => {
    for (let c = 0; c <= 4; c++) {
      for (let k = 2; k <= 4; k++) {
        expect(passHatK(4, c, k)).toBeLessThanOrEqual(passHatK(4, c, k - 1));
        expect(passAtK(4, c, k)).toBeGreaterThanOrEqual(passAtK(4, c, k - 1));
      }
    }
  });

  it("refuses a k it has no tries for", () => {
    expect(() => passHatK(4, 2, 5)).toThrow();
    expect(() => passAtK(4, 2, 0)).toThrow();
    expect(() => passHatK(4, 5, 1)).toThrow();
  });

  it("averages across tasks", () => {
    const tasks = [task("a", 4, 4), task("b", 4, 2), task("c", 4, 0)];
    // (1 + 1/6 + 0) / 3
    expect(passEstimate(tasks, 2, "hat").value).toBeCloseTo(7 / 18, 12);
    // (1 + 5/6 + 0) / 3
    expect(passEstimate(tasks, 2, "at").value).toBeCloseTo(11 / 18, 12);
  });
});

describe("bootstrap", () => {
  const values = [1, 0.75, 0.5, 0.5, 0.25, 0, 1, 1, 0, 0.75];

  it("gives the same interval from the same seed", () => {
    expect(bootstrapMean(values)).toEqual(bootstrapMean(values));
    expect(bootstrapMean(values, { seed: 7 })).toEqual(bootstrapMean(values, { seed: 7 }));
  });

  it("pins the interval for a fixed seed, so a change to the method shows up", () => {
    // The mean is 0.575; these are the 2.5th and 97.5th of 2,000 resampled means.
    expect(bootstrapMean(values, { seed: 1, iterations: 2000 })).toEqual({ lo: 0.35, hi: 0.8 });
  });

  it("comes out the same whatever order the tasks were written in", () => {
    const tasks = [task("b", 4, 2), task("a", 4, 4), task("c", 4, 1)];
    expect(passEstimate(tasks, 1, "hat")).toEqual(passEstimate([...tasks].reverse(), 1, "hat"));
  });

  it("is a single point when every task agrees", () => {
    expect(bootstrapMean([0.5, 0.5, 0.5])).toEqual({ lo: 0.5, hi: 0.5 });
  });

  it("is close to the textbook width for 50 tasks at about 50%", () => {
    // 50 tasks, half always pass and half never: standard error 0.5/√50 ≈ 0.071,
    // so the 95% interval is about ±14 points, as the project spec expects.
    const half = Array.from({ length: 50 }, (_, i) => (i % 2 === 0 ? 1 : 0));
    const { lo, hi } = bootstrapMean(half);
    expect((hi - lo) / 2).toBeGreaterThan(0.12);
    expect((hi - lo) / 2).toBeLessThan(0.16);
  });

  it("uses a generator that repeats from its seed and stays in [0, 1)", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("McNemar's exact test", () => {
  // Fagerland, Lydersen & Laake (2013), "The McNemar test for binary
  // matched-pairs data", BMC Medical Research Methodology 13:91, Table 1:
  // 1 and 7 discordant pairs, exact conditional p = 0.070.
  it("matches the textbook example", () => {
    expect(mcnemarExact(1, 7)).toBeCloseTo(0.0703125, 7);
    expect(mcnemarExact(7, 1)).toBeCloseTo(0.0703125, 7);
  });

  it("matches hand-worked cases", () => {
    // 1 and 9: 2 × (C(10,0) + C(10,1)) / 2^10 = 22/1024.
    expect(mcnemarExact(1, 9)).toBeCloseTo(22 / 1024, 12);
    // 0 and 6: 2 / 64.
    expect(mcnemarExact(0, 6)).toBeCloseTo(2 / 64, 12);
    // Even split: no evidence either way.
    expect(mcnemarExact(3, 3)).toBe(1);
    expect(mcnemarExact(0, 0)).toBe(1);
  });

  it("counts a task as a success only when most of its tries passed", () => {
    expect(majorityPassed(task("x", 4, 3))).toBe(true);
    expect(majorityPassed(task("x", 4, 2))).toBe(false);
    const pairs: PairedOutcome[] = [
      { taskId: "a", a: task("a", 4, 4), b: task("a", 4, 1) },
      { taskId: "b", a: task("b", 4, 2), b: task("b", 4, 3) },
      { taskId: "c", a: task("c", 4, 3), b: task("c", 4, 4) },
    ];
    expect(mcnemarOnTasks(pairs)).toEqual({ onlyA: 1, onlyB: 1, p: 1 });
  });
});

describe("paired difference and noise", () => {
  const pairs: PairedOutcome[] = [
    { taskId: "a", a: task("a", 4, 4), b: task("a", 4, 4) },
    { taskId: "b", a: task("b", 4, 2), b: task("b", 4, 3) },
    { taskId: "c", a: task("c", 4, 1), b: task("c", 4, 0) },
    { taskId: "d", a: task("d", 4, 0), b: task("d", 4, 2) },
  ];

  it("is B minus A on the shared tasks", () => {
    // (0 + 0.25 − 0.25 + 0.5) / 4
    expect(pairedDifference(pairs).value).toBeCloseTo(0.125, 12);
    expect(pairedDifference(pairs)).toEqual(pairedDifference([...pairs].reverse()));
  });

  it("works out the noise floor by hand", () => {
    // 1.96 × √(0 + 0.0625 + 0.0625 + 0.25) / 4
    expect(noiseFloor(pairs)).toBeCloseTo((1.96 * Math.sqrt(0.375)) / 4, 12);
    const same = pairs.map((p) => ({ ...p, b: p.a }));
    expect(noiseFloor(same)).toBe(0);
  });

  it("counts flips on the tries both runs have", () => {
    const a = new Map([["a#1", true], ["a#2", false], ["b#1", true], ["c#1", true]]);
    const b = new Map([["a#1", true], ["a#2", true], ["b#1", false], ["d#1", true]]);
    expect(flipRate(a, b)).toEqual({ outcomes: 3, flips: 2, rate: 2 / 3 });
  });
});

describe("verdict", () => {
  const big = { value: -0.3, lo: -0.45, hi: -0.15 };

  it("is worse only when the floor, the interval and the p-value all agree", () => {
    expect(verdict({ difference: big, p: 0.001, floor: 0.06 })).toBe("worse");
    expect(verdict({ difference: { value: 0.3, lo: 0.15, hi: 0.45 }, p: 0.001, floor: 0.06 })).toBe("better");
  });

  it("is within noise when any one of them doesn't", () => {
    expect(verdict({ difference: big, p: 0.001, floor: 0.35 })).toBe("within-noise");
    expect(verdict({ difference: big, p: 0.2, floor: 0.06 })).toBe("within-noise");
    expect(verdict({ difference: { value: -0.3, lo: -0.5, hi: 0.02 }, p: 0.001, floor: 0.06 })).toBe("within-noise");
    // Positive but smaller than the floor: still within noise.
    expect(verdict({ difference: { value: 0.03, lo: 0.01, hi: 0.05 }, p: 0.01, floor: 0.05 })).toBe("within-noise");
  });

  it("gives no verdict without a noise floor", () => {
    expect(verdict({ difference: big, p: 0.001, floor: null })).toBe("no-noise-floor");
  });
});

describe("agreement", () => {
  // The worked example on Wikipedia's "Cohen's kappa" page: 50 proposals, both
  // say yes to 20, A yes and B no to 5, A no and B yes to 10, both no to 15.
  // p_o = 0.7, p_e = 0.5, κ = 0.4.
  it("matches the worked κ example", () => {
    const items = [
      ...Array.from({ length: 20 }, () => ({ truth: true, predicted: true })),
      ...Array.from({ length: 5 }, () => ({ truth: true, predicted: false })),
      ...Array.from({ length: 10 }, () => ({ truth: false, predicted: true })),
      ...Array.from({ length: 15 }, () => ({ truth: false, predicted: false })),
    ];
    const a = agreement(items);
    expect(a.kappa).toBeCloseTo(0.4, 12);
    expect(a.tpr).toBeCloseTo(20 / 25, 12);
    expect(a.tnr).toBeCloseTo(15 / 25, 12);
    expect([a.truePositives, a.falseNegatives, a.falsePositives, a.trueNegatives]).toEqual([20, 5, 10, 15]);
  });

  it("is 1 for perfect agreement and 0 for chance", () => {
    expect(agreement([{ truth: true, predicted: true }, { truth: false, predicted: false }]).kappa).toBe(1);
    // A rater that always says "fail" against labels that are half fails.
    const chance = agreement([{ truth: true, predicted: true }, { truth: false, predicted: true }]);
    expect(chance.kappa).toBe(0);
    expect(chance.tnr).toBe(0);
  });

  it("leaves κ undefined when both always gave the same answer", () => {
    expect(agreement([{ truth: true, predicted: true }]).kappa).toBeNaN();
    expect(agreement([{ truth: true, predicted: true }]).tnr).toBeNaN();
  });
});

describe("agreementEstimate", () => {
  const item = (truth: boolean, predicted: boolean) => ({ truth, predicted });
  const groups = [
    [item(true, true), item(false, false), item(false, false)],
    [item(true, false), item(false, false)],
    [item(true, true), item(false, true), item(false, false)],
    [item(false, false), item(false, false)],
    [item(true, true), item(true, true)],
  ];

  it("has the same point values as agreement() on every item", () => {
    const e = agreementEstimate(groups);
    const a = agreement(groups.flat());
    expect(e.kappa).toBe(a.kappa);
    expect(e.kappaEstimate.value).toBe(a.kappa);
    expect(e.tprEstimate.value).toBe(a.tpr);
    expect(e.tnrEstimate.value).toBe(a.tnr);
  });

  it("gives the same intervals for the same input, around the point", () => {
    const e = agreementEstimate(groups);
    expect(agreementEstimate(groups)).toEqual(e);
    for (const x of [e.kappaEstimate, e.tprEstimate, e.tnrEstimate]) {
      expect(x.lo).toBeLessThanOrEqual(x.value);
      expect(x.hi).toBeGreaterThanOrEqual(x.value);
    }
  });

  it("has no width when every task agrees perfectly", () => {
    const e = agreementEstimate([[item(true, true), item(false, false)], [item(true, true), item(false, false)]]);
    expect(e.kappaEstimate).toEqual({ value: 1, lo: 1, hi: 1 });
  });

  it("leaves κ undefined, interval too, when there's only one answer", () => {
    const e = agreementEstimate([[item(false, false)], [item(false, false)]]);
    expect(e.kappaEstimate.value).toBeNaN();
    expect(e.kappaEstimate.lo).toBeNaN();
    expect(e.tprEstimate.value).toBeNaN();
    expect(e.tnrEstimate.value).toBe(1);
  });
});

describe("bootstrapRatio", () => {
  it("pools hits over chances rather than averaging tasks' ratios", () => {
    // 1/1 and 0/3: the pooled rate is 1/4, the average of ratios would be 1/2.
    expect(bootstrapRatio([{ hits: 1, chances: 1 }, { hits: 0, chances: 3 }]).value).toBe(0.25);
  });
  it("gives the same interval for the same input", () => {
    const parts = [{ hits: 3, chances: 4 }, { hits: 1, chances: 4 }, { hits: 4, chances: 4 }, { hits: 0, chances: 2 }];
    expect(bootstrapRatio(parts)).toEqual(bootstrapRatio(parts));
    const e = bootstrapRatio(parts);
    expect(e.lo).toBeLessThanOrEqual(e.value);
    expect(e.hi).toBeGreaterThanOrEqual(e.value);
  });
  it("has no interval width when every task agrees", () => {
    expect(bootstrapRatio([{ hits: 2, chances: 2 }, { hits: 4, chances: 4 }])).toEqual({ value: 1, lo: 1, hi: 1 });
  });
  it("is NaN, not zero, with no chances at all", () => {
    expect(bootstrapRatio([{ hits: 0, chances: 0 }]).value).toBeNaN();
  });
  it("skips resamples with no chances instead of counting them as zero", () => {
    // Half the tasks never had the chance; every resample with one is 100%.
    expect(bootstrapRatio([{ hits: 2, chances: 2 }, { hits: 0, chances: 0 }])).toEqual({ value: 1, lo: 1, hi: 1 });
  });
});
