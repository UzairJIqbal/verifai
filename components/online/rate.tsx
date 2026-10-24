import type { OnlineRate, OnlineRateName } from "@/src/online/schema";

export const RATE_LABELS: Record<OnlineRateName, string> = {
  hallucination: "Hallucination",
  policy: "Policy broken",
  toolErrors: "Tool errors",
  loops: "Loops",
  flagged: "Flagged",
};

const pct = (x: number) => `${Math.round(x * 100)}%`;

// A rate as everywhere on these pages: the share, its 95% interval, and the
// count it came from.
export function RateCell({ rate }: { rate: OnlineRate }) {
  if (rate.estimate === null) return <span className="text-muted-foreground">– (0 known)</span>;
  return (
    <span className="tabular-nums">
      {pct(rate.estimate.value)}{" "}
      <span className="text-muted-foreground">
        [{pct(rate.estimate.lo)}–{pct(rate.estimate.hi)}] {rate.hits}/{rate.of}
      </span>
    </span>
  );
}

export const rateText = (rate: OnlineRate): string =>
  rate.estimate === null ? "–" : `${pct(rate.estimate.value)} [${pct(rate.estimate.lo)}–${pct(rate.estimate.hi)}] in ${rate.of} graded`;
