import Link from "next/link";
import type { RunStats, Slice } from "@/src/stats/report";
import type { Estimate } from "@/src/stats/stats";
import { interval, pct } from "@/src/stats/format";
import { CategoryChart } from "./category-chart";

// The tries behind a slice: the run's trial list, filtered to it.
export const trialsHref = (runId: string, filter: { category?: string; difficulty?: string; tag?: string } = {}) => {
  const q = new URLSearchParams(Object.entries(filter).filter((e): e is [string, string] => e[1] !== undefined));
  return `/runs/${runId}${q.size > 0 ? `?${q}` : ""}#trials`;
};

export const linkClass = "text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function Num({ e, href }: { e: Estimate; href: string }) {
  return (
    <Link href={href} className={linkClass}>
      <span className="font-mono">{pct(e.value)}</span>
      <span className="block font-mono text-[11px] text-muted-foreground">{interval(e)}</span>
    </Link>
  );
}

// The run report: the success rate with its interval, then pass^k and pass@k
// for the whole run, each category and each difficulty. Every number opens the
// tries it was counted from.
export function RunStatsReport({ runId, stats }: { runId: string; stats: RunStats }) {
  const o = stats.overall;
  const ks = o.passHat.map((_, i) => i + 1);
  const cell = "px-3 py-1.5 align-top whitespace-nowrap";
  const head = `${cell} font-normal`;
  const group = (label: string) => (
    <tr className="border-b bg-muted/40">
      <td colSpan={4 + ks.length * 2} className={`${cell} text-[11px] text-muted-foreground`}>
        {label}
      </td>
    </tr>
  );
  const row = (label: string, s: Slice, href: string) => (
    <tr key={label} className="border-b last:border-b-0 hover:bg-muted/60">
      <td className={cell}>
        <Link href={href} className="text-link hover:underline">
          {label}
        </Link>
      </td>
      <td className={`${cell} text-right font-mono`}>{s.tasks}</td>
      <td className={`${cell} text-right font-mono`}>{s.tries}</td>
      <td className={`${cell} text-right font-mono`}>
        <Link href={href} className={linkClass}>
          {s.passed}/{s.tries}
        </Link>
      </td>
      {s.passHat.map((e, i) => (
        <td key={`hat${i}`} className={`${cell} text-right ${i === 0 ? "border-l" : ""}`}>
          <Num e={e} href={href} />
        </td>
      ))}
      {s.passAt.map((e, i) => (
        <td key={`at${i}`} className={`${cell} text-right ${i === 0 ? "border-l" : ""}`}>
          <Num e={e} href={href} />
        </td>
      ))}
    </tr>
  );
  const last = o.passHat[o.passHat.length - 1];

  return (
    <section className="mb-6" aria-label="Run report">
      <p className="mb-1 text-[13px]">
        <Link href={trialsHref(runId)} className={linkClass}>
          Success rate <span className="font-mono font-semibold">{pct(o.passHat[0].value)}</span>{" "}
          <span className="font-mono text-muted-foreground">({interval(o.passHat[0])})</span>
        </Link>
        <span className="text-muted-foreground">
          {" "}
          from {o.tasks} tasks × {o.tries / Math.max(o.tasks, 1)} tries, {o.passed}/{o.tries} passed ·{" "}
        </span>
        <Link href={trialsHref(runId)} className={linkClass}>
          pass^{ks.length} <span className="font-mono font-semibold">{pct(last.value)}</span> <span className="font-mono text-muted-foreground">({interval(last)})</span>
        </Link>
      </p>
      <p className="mb-3 max-w-prose text-[12px] text-muted-foreground">
        Brackets and the small figures are 95% intervals: the tasks were resampled with replacement 10,000 times, and the middle 95% of
        the results is shown. pass^k is the chance that k tries of a task all pass, which is how reliable it is; pass@k is the chance at
        least one does. Errored tries count as not passed.
      </p>

      <div className="mb-4 overflow-x-auto rounded-md border">
        <table className="w-full text-left text-[12px]">
          <thead className="border-b text-muted-foreground">
            <tr>
              <th className={head}></th>
              <th className={`${head} text-right`}>tasks</th>
              <th className={`${head} text-right`}>tries</th>
              <th className={`${head} text-right`}>passed</th>
              {ks.map((k) => (
                <th key={`hat${k}`} className={`${head} text-right ${k === 1 ? "border-l" : ""}`}>
                  pass^{k}
                </th>
              ))}
              {ks.map((k) => (
                <th key={`at${k}`} className={`${head} text-right ${k === 1 ? "border-l" : ""}`}>
                  pass@{k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {row("all tasks", o, trialsHref(runId))}
            {group("by category")}
            {Object.entries(stats.byCategory).map(([c, s]) => row(c, s, trialsHref(runId, { category: c })))}
            {group("by difficulty")}
            {Object.entries(stats.byDifficulty).map(([d, s]) => row(d, s, trialsHref(runId, { difficulty: d })))}
          </tbody>
        </table>
      </div>

      <CategoryChart
        bars={Object.entries(stats.byCategory).map(([category, s]) => ({
          category,
          ...s.passHat[0],
          tasks: s.tasks,
          tries: s.tries,
          href: trialsHref(runId, { category }),
        }))}
      />
    </section>
  );
}
