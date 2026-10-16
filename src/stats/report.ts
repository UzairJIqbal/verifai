// The numbers a run report, a comparison and a noise measurement show, built
// from tries' outcomes with the functions in ./stats. Browser-safe.
import { CATEGORIES, DIFFICULTIES, type Category, type Difficulty } from "../tasks/schema";
import {
  flipRate,
  maxK,
  mcnemarOnTasks,
  mean,
  noiseFloor,
  pairedDifference,
  passEstimate,
  verdict,
  type Estimate,
  type McNemar,
  type PairedOutcome,
  type TaskOutcome,
  type Verdict,
} from "./stats";

// One try, as far as the statistics care. Errored tries count as not passed.
export type OutcomeRow = { taskId: string; category: Category; difficulty: Difficulty; tryNumber: number; passed: boolean };

// From a saved try, full or sealed.
export const outcomeRow = (t: { taskId: string; category: Category; difficulty: Difficulty; tryNumber: number; status: string }): OutcomeRow => ({
  taskId: t.taskId,
  category: t.category,
  difficulty: t.difficulty,
  tryNumber: t.tryNumber,
  passed: t.status === "passed",
});

export function taskOutcomes(rows: OutcomeRow[]): TaskOutcome[] {
  const tasks = new Map<string, TaskOutcome>();
  for (const r of rows) {
    const t = tasks.get(r.taskId) ?? { taskId: r.taskId, tries: 0, successes: 0 };
    t.tries++;
    if (r.passed) t.successes++;
    tasks.set(r.taskId, t);
  }
  return [...tasks.values()];
}

// One slice of a run (all of it, a category, a difficulty). passHat[k − 1] is
// pass^k and passAt[k − 1] pass@k, for k from 1 to the tries every task has.
// pass^1 is the success rate.
export type Slice = { tasks: number; tries: number; passed: number; passHat: Estimate[]; passAt: Estimate[] };

export function sliceStats(rows: OutcomeRow[]): Slice {
  const tasks = taskOutcomes(rows);
  const ks = Array.from({ length: maxK(tasks) }, (_, i) => i + 1);
  return {
    tasks: tasks.length,
    tries: rows.length,
    passed: rows.filter((r) => r.passed).length,
    passHat: ks.map((k) => passEstimate(tasks, k, "hat")),
    passAt: ks.map((k) => passEstimate(tasks, k, "at")),
  };
}

export type RunStats = {
  overall: Slice;
  // Only the categories and difficulties the run has tasks in.
  byCategory: Partial<Record<Category, Slice>>;
  byDifficulty: Partial<Record<Difficulty, Slice>>;
};

function groupBy<K extends string>(rows: OutcomeRow[], keys: readonly K[], pick: (r: OutcomeRow) => K, build: (rows: OutcomeRow[]) => Slice) {
  const out: Partial<Record<K, Slice>> = {};
  for (const key of keys) {
    const some = rows.filter((r) => pick(r) === key);
    if (some.length > 0) out[key] = build(some);
  }
  return out;
}

export function runStats(rows: OutcomeRow[]): RunStats {
  return {
    overall: sliceStats(rows),
    byCategory: groupBy(rows, CATEGORIES, (r) => r.category, sliceStats),
    byDifficulty: groupBy(rows, DIFFICULTIES, (r) => r.difficulty, sliceStats),
  };
}

function pairUp(a: OutcomeRow[], b: OutcomeRow[]): PairedOutcome[] {
  const inB = new Map(taskOutcomes(b).map((t) => [t.taskId, t]));
  return taskOutcomes(a).flatMap((ta) => {
    const tb = inB.get(ta.taskId);
    return tb ? [{ taskId: ta.taskId, a: ta, b: tb }] : [];
  });
}

const tryKey = (r: OutcomeRow) => `${r.taskId}#${r.tryNumber}`;

// The noise between two runs of one configuration, for a slice of tasks.
export type NoiseSlice = { tasks: number; outcomes: number; flips: number; flipRate: number; floor: number };

function noiseSlice(a: OutcomeRow[], b: OutcomeRow[]): NoiseSlice {
  const flips = flipRate(new Map(a.map((r) => [tryKey(r), r.passed])), new Map(b.map((r) => [tryKey(r), r.passed])));
  const pairs = pairUp(a, b);
  return { tasks: pairs.length, outcomes: flips.outcomes, flips: flips.flips, flipRate: flips.rate, floor: noiseFloor(pairs) };
}

export type Noise = { overall: NoiseSlice; byCategory: Partial<Record<Category, NoiseSlice>> };

export function measureNoise(a: OutcomeRow[], b: OutcomeRow[]): Noise {
  const byCategory: Partial<Record<Category, NoiseSlice>> = {};
  for (const c of CATEGORIES) {
    const ca = a.filter((r) => r.category === c);
    const cb = b.filter((r) => r.category === c);
    if (ca.length > 0 && cb.length > 0) byCategory[c] = noiseSlice(ca, cb);
  }
  return { overall: noiseSlice(a, b), byCategory };
}

// When two configurations each have a floor, a change has to clear the wider
// one, slice by slice: the overall and each category independently, since the
// noisier configuration overall needn't be the noisier in every category.
export function widestNoise(measured: Noise[]): Noise | null {
  if (measured.length === 0) return null;
  const wider = (x: NoiseSlice | undefined, y: NoiseSlice | undefined) => (x === undefined || (y !== undefined && y.floor > x.floor) ? y : x);
  const byCategory: Partial<Record<Category, NoiseSlice>> = {};
  for (const c of CATEGORIES) {
    const slice = measured.map((n) => n.byCategory[c]).reduce(wider, undefined);
    if (slice !== undefined) byCategory[c] = slice;
  }
  const overall = measured.map((n) => n.overall).reduce((x, y) => (y.floor > x.floor ? y : x));
  return { overall, byCategory };
}

// Two runs on the tasks they share, for one slice. Rates are each run's
// success rate on those tasks alone, so the difference is like for like.
export type ComparisonRow = {
  tasks: number;
  aRate: number;
  bRate: number;
  // B minus A.
  difference: Estimate;
  mcnemar: McNemar;
  floor: number | null;
  verdict: Verdict;
};

function compareSlice(pairs: PairedOutcome[], floor: number | null): ComparisonRow {
  const difference = pairedDifference(pairs);
  const mcnemar = mcnemarOnTasks(pairs);
  return {
    tasks: pairs.length,
    aRate: mean(pairs.map((p) => p.a.successes / p.a.tries)),
    bRate: mean(pairs.map((p) => p.b.successes / p.b.tries)),
    difference,
    mcnemar,
    floor,
    verdict: verdict({ difference, p: mcnemar.p, floor }),
  };
}

export type Comparison = {
  sharedTasks: number;
  onlyInA: string[];
  onlyInB: string[];
  overall: ComparisonRow;
  byCategory: Partial<Record<Category, ComparisonRow>>;
};

// Each category is judged against its own floor from the noise runs, since a
// handful of tasks wobbles more than all of them together.
export function compareRuns(a: OutcomeRow[], b: OutcomeRow[], noise: Noise | null): Comparison {
  const pairs = pairUp(a, b);
  const shared = new Set(pairs.map((p) => p.taskId));
  const category = new Map(a.map((r) => [r.taskId, r.category]));
  const byCategory: Partial<Record<Category, ComparisonRow>> = {};
  for (const c of CATEGORIES) {
    const some = pairs.filter((p) => category.get(p.taskId) === c);
    if (some.length > 0) byCategory[c] = compareSlice(some, noise === null ? null : (noise.byCategory[c]?.floor ?? null));
  }
  const sortedUnique = (ids: string[]) => [...new Set(ids)].sort();
  return {
    sharedTasks: pairs.length,
    onlyInA: sortedUnique(a.map((r) => r.taskId).filter((id) => !shared.has(id))),
    onlyInB: sortedUnique(b.map((r) => r.taskId).filter((id) => !shared.has(id))),
    overall: compareSlice(pairs, noise?.overall.floor ?? null),
    byCategory,
  };
}
