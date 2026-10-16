"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ErrorBar, ResponsiveContainer, XAxis, YAxis } from "recharts";

export type CategoryBar = { category: string; value: number; lo: number; hi: number; tasks: number; tries: number; href: string };

// Success rate by category, each with its 95% interval. Greyscale: the bars
// are a reading, not a pass or a fail. Nothing animates; a bar opens the tries
// behind it.
export function CategoryChart({ bars }: { bars: CategoryBar[] }) {
  const router = useRouter();
  const data = bars.map((b) => ({
    label: `${b.category} (${b.tasks}×${b.tries / Math.max(b.tasks, 1)})`,
    value: b.value * 100,
    // ErrorBar takes distances below and above the bar, not the bounds.
    error: [(b.value - b.lo) * 100, (b.hi - b.value) * 100],
    href: b.href,
  }));
  return (
    <figure className="max-w-[40rem] [&_.recharts-errorBar]:pointer-events-none">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--border)" }} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} interval={0} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit="%" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <Bar
              dataKey="value"
              fill="var(--muted-foreground)"
              fillOpacity={0.35}
              isAnimationActive={false}
              cursor="pointer"
              onClick={(entry) => {
                const href = (entry.payload as { href?: unknown } | undefined)?.href;
                if (typeof href === "string") router.push(href);
              }}
            >
              <ErrorBar dataKey="error" stroke="var(--foreground)" strokeWidth={1} width={6} isAnimationActive={false} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-1 text-[11px] text-muted-foreground">
        Success rate by category (tasks × tries). The lines are 95% intervals from resampling tasks. Click a bar for its tries.
      </figcaption>
    </figure>
  );
}
