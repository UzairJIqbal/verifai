"use client";

import { CartesianGrid, ErrorBar, Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";

export type RatePoint = { label: string; value: number | null; lo: number | null; hi: number | null; of: number };

// One rate over the batches, oldest on the left: a point per batch with its
// 95% interval. Greyscale: a reading, not a verdict; the threshold, where
// there is one, is the dashed line. Nothing animates.
export function RateChart({ title, points, threshold }: { title: string; points: RatePoint[]; threshold: number | null }) {
  const data = points.map((p) => ({
    label: `${p.label} (${p.of})`,
    value: p.value === null ? null : p.value * 100,
    // ErrorBar takes distances below and above the point, not the bounds.
    error: p.value === null || p.lo === null || p.hi === null ? [0, 0] : [(p.value - p.lo) * 100, (p.hi - p.value) * 100],
  }));
  return (
    <figure className="min-w-0">
      <figcaption className="mb-1 text-[12px] font-medium">{title}</figcaption>
      <div className="h-36 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--border)" }} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} ticks={[0, 50, 100]} unit="%" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
            {threshold !== null && <ReferenceLine y={threshold * 100} stroke="var(--fail)" strokeDasharray="4 3" />}
            <Line
              dataKey="value"
              stroke="var(--muted-foreground)"
              strokeWidth={1}
              dot={{ r: 2.5, fill: "var(--foreground)", stroke: "none" }}
              connectNulls={false}
              isAnimationActive={false}
            >
              <ErrorBar dataKey="error" stroke="var(--foreground)" strokeWidth={1} width={5} isAnimationActive={false} />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
