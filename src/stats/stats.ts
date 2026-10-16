// The statistics behind every number VerifAI shows. Pure functions, no stats
// package, and no Node modules, so the dashboard and the commands compute the
// same thing. Rates are fractions from 0 to 1; the callers turn them into
// percent or points.

// n choose k, exact for the small numbers here (up to about 50).
export function comb(n: number, k: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0) throw new Error(`comb(${n}, ${k}) needs whole numbers and n ≥ 0.`);
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

function checkTries(n: number, c: number, k: number): void {
  if (!Number.isInteger(n) || !Number.isInteger(c) || !Number.isInteger(k)) throw new Error("Tries, successes and k must be whole numbers.");
  if (c < 0 || c > n) throw new Error(`${c} successes out of ${n} tries isn't possible.`);
  if (k < 1 || k > n) throw new Error(`k must be between 1 and the ${n} tries there are; got ${k}.`);
}

// The chance that k tries drawn from a task's n tries (c of them passed) all
// pass: τ-bench's pass^k. Reliability, because a customer gets one go.
export function passHatK(n: number, c: number, k: number): number {
  checkTries(n, c, k);
  return comb(c, k) / comb(n, k);
}

// The chance that at least one of k tries drawn passes. Potential, not reliability.
export function passAtK(n: number, c: number, k: number): number {
  checkTries(n, c, k);
  return 1 - comb(n - c, k) / comb(n, k);
}

// One task's tries in a run, reduced to what the statistics need.
export type TaskOutcome = { taskId: string; tries: number; successes: number };

// A task counts as a success for McNemar when most of its tries passed:
// strictly more than half, so 2 of 4 is not a success.
export const majorityPassed = (t: TaskOutcome) => t.successes * 2 > t.tries;

export const mean = (values: number[]) => (values.length === 0 ? NaN : values.reduce((a, b) => a + b, 0) / values.length);

// mulberry32: a small, well-known seeded generator. Enough for resampling, and
// the same seed always gives the same sequence on every machine.
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fixed, so the same run always prints the same interval.
export const BOOTSTRAP_SEED = 20261016;
export const BOOTSTRAP_ITERATIONS = 10_000;

// The q-th quantile of sorted values, interpolating between neighbours.
function quantile(sorted: number[], q: number): number {
  const at = (sorted.length - 1) * q;
  const below = Math.floor(at);
  const above = Math.ceil(at);
  return sorted[below] + (sorted[above] - sorted[below]) * (at - below);
}

export type Interval = { lo: number; hi: number };

// The middle 95% of the mean over many resamples, drawn with replacement.
// Each value is one task's number, so this resamples tasks, never tries:
// tries of one task aren't independent, and resampling them would make the
// interval look tighter than it is. The caller sorts the values by task id
// first, so the order the trials were written in can't move the interval.
export function bootstrapMean(values: number[], options: { seed?: number; iterations?: number } = {}): Interval {
  const { seed = BOOTSTRAP_SEED, iterations = BOOTSTRAP_ITERATIONS } = options;
  if (values.length === 0) return { lo: NaN, hi: NaN };
  const random = seededRandom(seed);
  const n = values.length;
  const means = new Array<number>(iterations);
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) sum += values[Math.floor(random() * n)];
    means[i] = sum / n;
  }
  means.sort((a, b) => a - b);
  return { lo: quantile(means, 0.025), hi: quantile(means, 0.975) };
}

export type Estimate = { value: number } & Interval;

const byTask = (tasks: TaskOutcome[]) => [...tasks].sort((a, b) => (a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0));

// The largest k every task has tries for.
export const maxK = (tasks: TaskOutcome[]) => (tasks.length === 0 ? 0 : Math.min(...tasks.map((t) => t.tries)));

// pass^k (or pass@k) averaged across tasks, with its bootstrap interval.
export function passEstimate(tasks: TaskOutcome[], k: number, kind: "hat" | "at"): Estimate {
  const f = kind === "hat" ? passHatK : passAtK;
  const values = byTask(tasks).map((t) => f(t.tries, t.successes, k));
  return { value: mean(values), ...bootstrapMean(values) };
}

// Two runs' outcomes on one task they share.
export type PairedOutcome = { taskId: string; a: TaskOutcome; b: TaskOutcome };

const rate = (t: TaskOutcome) => t.successes / t.tries;

// B's success rate minus A's on the shared tasks, with a paired bootstrap
// interval: each resample keeps a task's two outcomes together.
export function pairedDifference(pairs: PairedOutcome[]): Estimate {
  const diffs = [...pairs].sort((x, y) => (x.taskId < y.taskId ? -1 : x.taskId > y.taskId ? 1 : 0)).map((p) => rate(p.b) - rate(p.a));
  return { value: mean(diffs), ...bootstrapMean(diffs) };
}

// McNemar's exact test. onlyA: tasks that succeed in A but not B; onlyB the
// reverse. Under "no real difference" each such task is a coin flip, so the
// p-value is the two-sided binomial tail. Tasks that agree tell us nothing.
export function mcnemarExact(onlyA: number, onlyB: number): number {
  if (!Number.isInteger(onlyA) || !Number.isInteger(onlyB) || onlyA < 0 || onlyB < 0) throw new Error("McNemar needs whole, non-negative counts.");
  const n = onlyA + onlyB;
  if (n === 0) return 1;
  let tail = 0;
  for (let i = 0; i <= Math.min(onlyA, onlyB); i++) tail += comb(n, i);
  return Math.min(1, (2 * tail) / 2 ** n);
}

export type McNemar = { onlyA: number; onlyB: number; p: number };

export function mcnemarOnTasks(pairs: PairedOutcome[]): McNemar {
  const onlyA = pairs.filter((p) => majorityPassed(p.a) && !majorityPassed(p.b)).length;
  const onlyB = pairs.filter((p) => !majorityPassed(p.a) && majorityPassed(p.b)).length;
  return { onlyA, onlyB, p: mcnemarExact(onlyA, onlyB) };
}

export type FlipRate = { outcomes: number; flips: number; rate: number };

// Between two runs of the same configuration: the share of (task, try)
// outcomes, keyed "task#try", that changed. Only keys both runs have count.
export function flipRate(a: Map<string, boolean>, b: Map<string, boolean>): FlipRate {
  let outcomes = 0;
  let flips = 0;
  for (const [key, passed] of a) {
    const other = b.get(key);
    if (other === undefined) continue;
    outcomes++;
    if (other !== passed) flips++;
  }
  return { outcomes, flips, rate: outcomes === 0 ? NaN : flips / outcomes };
}

// The noise floor from two runs of the same configuration: how far apart two
// identical runs' success rates land 95% of the time. Each task's own change
// between the runs is what flipped there; with no real difference those
// changes average to zero, and the spread of their mean is √(Σ d²)/T. Tasks
// are the unit, the same as the bootstrap.
export function noiseFloor(pairs: PairedOutcome[]): number {
  if (pairs.length === 0) return NaN;
  const sumSquares = pairs.reduce((s, p) => s + (rate(p.b) - rate(p.a)) ** 2, 0);
  return (1.96 * Math.sqrt(sumSquares)) / pairs.length;
}

export type Verdict = "better" | "worse" | "within-noise" | "no-noise-floor";

export const SIGNIFICANCE = 0.05;

// Better or worse only when all three agree: the change is bigger than the
// noise floor, its interval doesn't cross zero, and McNemar's p is under 0.05.
// Anything short of that is within noise, even when it's positive. With no
// floor measured there is no verdict at all.
export function verdict(args: { difference: Estimate; p: number; floor: number | null }): Verdict {
  const { difference: d, p, floor } = args;
  if (floor === null || Number.isNaN(floor)) return "no-noise-floor";
  const real = Math.abs(d.value) > floor && p < SIGNIFICANCE;
  if (real && d.value > 0 && d.lo > 0) return "better";
  if (real && d.value < 0 && d.hi < 0) return "worse";
  return "within-noise";
}

export type Agreement = {
  n: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  // Of the real positives, the share it caught. NaN when there are none.
  tpr: number;
  // Of the real negatives, the share it left alone. NaN when there are none.
  tnr: number;
  // Cohen's κ: agreement beyond what two raters guessing at their own rates
  // would reach by chance. 1 is perfect, 0 is chance.
  kappa: number;
};

// How far a rater (the judge) agrees with the truth (your labels). "Positive"
// is whatever the caller is looking for; for the judge it's a real failure.
export function agreement(items: { truth: boolean; predicted: boolean }[]): Agreement {
  const n = items.length;
  const tp = items.filter((i) => i.truth && i.predicted).length;
  const fp = items.filter((i) => !i.truth && i.predicted).length;
  const tn = items.filter((i) => !i.truth && !i.predicted).length;
  const fn = items.filter((i) => i.truth && !i.predicted).length;
  const observed = (tp + tn) / n;
  const chance = ((tp + fn) / n) * ((tp + fp) / n) + ((tn + fp) / n) * ((tn + fn) / n);
  // When both always gave the same one answer, chance already explains all
  // of it and κ is 0/0: undefined, not perfect.
  const kappa = n === 0 || chance === 1 ? NaN : (observed - chance) / (1 - chance);
  return {
    n,
    truePositives: tp,
    falsePositives: fp,
    trueNegatives: tn,
    falseNegatives: fn,
    tpr: tp + fn === 0 ? NaN : tp / (tp + fn),
    tnr: tn + fp === 0 ? NaN : tn / (tn + fp),
    kappa,
  };
}
