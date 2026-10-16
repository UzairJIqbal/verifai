// How the statistics are written down, the same in the terminal, the results
// files and the dashboard. Browser-safe.
import type { Estimate, Verdict } from "./stats";
import type { Slice } from "./report";

export const pct = (x: number) => (Number.isNaN(x) ? "–" : `${(x * 100).toFixed(1)}%`);
// A difference in success rate, in percentage points.
export const points = (x: number, signed = true) => (Number.isNaN(x) ? "–" : `${signed && x > 0 ? "+" : ""}${(x * 100).toFixed(1)}`);
export const interval = (e: Estimate) => `${(e.lo * 100).toFixed(1)}–${(e.hi * 100).toFixed(1)}`;
// "62.1% (48.6–75.0)": the estimate and its 95% interval.
export const withInterval = (e: Estimate) => `${pct(e.value)} (${interval(e)})`;
// A failure rate from a pass rate: the interval flips with it.
export const flipped = (e: Estimate | null): Estimate | null => (e === null ? null : { value: 1 - e.value, lo: 1 - e.hi, hi: 1 - e.lo });
export const pValue = (p: number) => (p < 0.001 ? "< 0.001" : p.toFixed(3));

// Tasks × tries, the sample size every number carries.
export const sampleSize = (s: Pick<Slice, "tasks" | "tries">) => `${s.tasks} tasks, ${s.tries} tries`;

export const VERDICT_WORDS: Record<Verdict, string> = {
  better: "better",
  worse: "worse",
  "within-noise": "within noise",
  "no-noise-floor": "no noise floor yet",
};
