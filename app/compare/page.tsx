import { Suspense } from "react";
import Link from "next/link";
import { EmptyState, PageHeading } from "@/components/shell/empty-state";
import { LoadError } from "@/components/runs/load-error";
import { formatWhen } from "@/components/runs/format";
import { trialsHref } from "@/components/runs/run-stats";
import { compareRunFiles, listRuns, readNoiseFloors, readRun, type RunComparison, type RunFiles } from "@/src/results/read";
import type { Report } from "@/src/results/schema";
import { interval, pct, points, pValue, VERDICT_WORDS } from "@/src/stats/format";
import { taskOutcomes, outcomeRow, type ComparisonRow } from "@/src/stats/report";
import type { Verdict } from "@/src/stats/stats";
import type { Metadata } from "next";

type Search = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (typeof v === "string" && v !== "" ? v : null);

// Which runs to compare is only known per request, so it's read inside Suspense.
export const metadata: Metadata = { title: "Compare" };

export default function ComparePage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <>
      <PageHeading title="Compare">
        Two finished runs side by side on the tasks they share: the change in success rate from A to B, its 95% interval, McNemar&apos;s
        p-value and a verdict against the noise floor. Better or worse needs all three to agree; anything else is within noise.
      </PageHeading>
      <Suspense fallback={<p className="text-muted-foreground">Loading the runs…</p>}>
        {searchParams.then((sp) => (
          <Compare a={one(sp.a)} b={one(sp.b)} category={one(sp.category)} />
        ))}
      </Suspense>
    </>
  );
}

const VERDICT_CLASS: Record<Verdict, string> = {
  better: "text-pass font-medium",
  worse: "text-fail font-medium",
  "within-noise": "text-noise",
  "no-noise-floor": "text-muted-foreground",
};

function Compare({ a, b, category }: { a: string | null; b: string | null; category: string | null }) {
  let runs: Report[];
  try {
    runs = listRuns().runs.filter((r) => !r.smoke);
  } catch (error) {
    return <LoadError title="The runs can't be listed." message={error instanceof Error ? error.message : String(error)} />;
  }
  if (runs.length < 2) {
    return (
      <EmptyState title={runs.length === 0 ? "No runs to compare yet." : "Only one run so far."}>
        Comparing needs two finished runs. Run <code>pnpm eval</code>, change one thing (a prompt or a tool description version in the
        config), and run it again. Smoke runs are never compared.
      </EmptyState>
    );
  }

  const picker = <Picker runs={runs} a={a ?? runs[1].runId} b={b ?? runs[0].runId} />;
  if (a === null || b === null) {
    return (
      <>
        {picker}
        <EmptyState title="Pick two runs.">
          A is the run before the change and B the one after. The newest two are picked for you; press Compare. From the terminal:{" "}
          <code>pnpm compare &lt;runA&gt; &lt;runB&gt;</code>.
        </EmptyState>
      </>
    );
  }

  let result: RunComparison;
  let floorProblems: string[];
  try {
    const [fa, fb] = [a, b].map((id) => {
      const files = readRun(id);
      if (files === null) throw new Error(`There's no run ${id} under results/. Pick one from the list.`);
      if (files.report.smoke) throw new Error(`${id} is a smoke run. It checks the machinery and is never compared.`);
      return files;
    });
    const floors = readNoiseFloors();
    floorProblems = floors.problems;
    result = compareRunFiles(fa, fb, floors.floors);
  } catch (error) {
    return (
      <>
        {picker}
        <LoadError title="These runs can't be compared." message={error instanceof Error ? error.message : String(error)} />
      </>
    );
  }
  const { comparison: c, floor, differences } = result;
  const here = (cat?: string) => `/compare?${new URLSearchParams({ a, b, ...(cat ? { category: cat } : {}) })}#tasks`;

  return (
    <>
      {picker}

      <div className={`mb-4 rounded-md border px-4 py-3 text-[12px] ${floor ? "" : "border-noise/50"}`}>
        {floor ? (
          <p>
            Noise floor <span className="font-mono font-semibold">{points(floor.overall.floor, false)} points</span>
            <span className="text-muted-foreground">
              : two identical runs of this configuration landed this far apart 95% of the time. Flip rate{" "}
              <span className="font-mono">{pct(floor.overall.flipRate)}</span> ({floor.overall.flips} of {floor.overall.outcomes} tries came
              out differently), from {floor.overall.tasks} tasks, measured {formatWhen(floor.measuredAt)} with runs{" "}
              {floor.runs.map((id, i) => (
                <span key={id}>
                  {i > 0 && " and "}
                  <Link href={`/runs/${id}`} className="font-mono">
                    {id}
                  </Link>
                </span>
              ))}
              .
            </span>
          </p>
        ) : (
          <p className="text-noise">
            No noise floor for either run&apos;s configuration, so there&apos;s no verdict. Run <code>pnpm noise</code> to measure one: it
            runs the dev split twice with the cache off and asks before starting.
          </p>
        )}
        {floorProblems.map((p, i) => (
          <p key={i} className="mt-1 whitespace-pre-wrap text-fail">
            {p}
          </p>
        ))}
      </div>

      {differences.length > 0 ? (
        <p className="mb-2 text-[12px] text-noise">
          These runs have different configurations, so a difference may come from any of them:{" "}
          <span className="font-mono">{differences.join(" · ")}</span>.
        </p>
      ) : (
        <p className="mb-2 text-[12px] text-muted-foreground">Same configuration in both runs.</p>
      )}
      {c.onlyInA.length + c.onlyInB.length > 0 && (
        <p className="mb-2 text-[12px] text-noise">
          Compared on the {c.sharedTasks} tasks both runs have. Only in A: <span className="font-mono">{c.onlyInA.join(", ") || "none"}</span>
          . Only in B: <span className="font-mono">{c.onlyInB.join(", ") || "none"}</span>.
        </p>
      )}

      {c.sharedTasks === 0 ? (
        <EmptyState title="These runs share no tasks.">Pick two runs of the same split and dataset.</EmptyState>
      ) : (
        <>
          <ComparisonTable result={result} here={here} />
          <TaskTable result={result} category={category} here={here} />
        </>
      )}
    </>
  );
}

function Picker({ runs, a, b }: { runs: Report[]; a: string; b: string }) {
  const select = "h-7 rounded border bg-background px-1.5 font-mono text-[12px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
  const label = (r: Report) =>
    `${r.runId} · ${r.split} ${r.datasetVersion} · prompt ${r.agent.promptVersion} · tools ${r.agent.toolDescriptionsVersion}${r.useCache ? "" : " · no cache"}`;
  return (
    <form action="/compare" method="get" className="mb-4 flex flex-wrap items-center gap-2 text-[12px]">
      <label className="flex items-center gap-1.5">
        A <select name="a" defaultValue={a} className={select}>{runs.map((r) => <option key={r.runId} value={r.runId}>{label(r)}</option>)}</select>
      </label>
      <label className="flex items-center gap-1.5">
        B <select name="b" defaultValue={b} className={select}>{runs.map((r) => <option key={r.runId} value={r.runId}>{label(r)}</option>)}</select>
      </label>
      <button type="submit" className="h-7 rounded border px-2.5 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        Compare
      </button>
    </form>
  );
}

function ComparisonTable({ result, here }: { result: RunComparison; here: (category?: string) => string }) {
  const { a, b, comparison: c } = result;
  const cell = "px-3 py-1.5 align-top whitespace-nowrap";
  const head = `${cell} font-normal`;
  const num = "text-foreground hover:underline";
  const row = (label: string, r: ComparisonRow, cat?: string) => (
    <tr key={label} className="border-b last:border-b-0 hover:bg-muted/60">
      <td className={cell}>{label}</td>
      <td className={`${cell} text-right font-mono`}>
        <Link href={here(cat)} className={num}>{r.tasks}</Link>
      </td>
      <td className={`${cell} text-right font-mono`}>
        <Link href={trialsHref(a.report.runId, cat ? { category: cat } : {})} className={num}>{pct(r.aRate)}</Link>
      </td>
      <td className={`${cell} text-right font-mono`}>
        <Link href={trialsHref(b.report.runId, cat ? { category: cat } : {})} className={num}>{pct(r.bRate)}</Link>
      </td>
      <td className={`${cell} text-right font-mono`}>
        <Link href={here(cat)} className={num}>
          {points(r.difference.value)}
          <span className="text-muted-foreground"> ({interval(r.difference)})</span>
        </Link>
      </td>
      <td className={`${cell} text-right font-mono`}>
        <Link href={here(cat)} className={num}>
          {pValue(r.mcnemar.p)} <span className="text-muted-foreground">({r.mcnemar.onlyA}/{r.mcnemar.onlyB})</span>
        </Link>
      </td>
      <td className={`${cell} text-right font-mono text-muted-foreground`}>{r.floor === null ? "–" : points(r.floor, false)}</td>
      <td className={`${cell} ${VERDICT_CLASS[r.verdict]}`}>{VERDICT_WORDS[r.verdict]}</td>
    </tr>
  );
  return (
    <>
      <div className="mb-2 overflow-x-auto rounded-md border">
        <table className="w-full text-left text-[12px]">
          <thead className="border-b text-muted-foreground">
            <tr>
              <th className={head}></th>
              <th className={`${head} text-right`}>tasks</th>
              <th className={`${head} text-right`}>
                A <span className="font-mono">{a.report.runId}</span>
              </th>
              <th className={`${head} text-right`}>
                B <span className="font-mono">{b.report.runId}</span>
              </th>
              <th className={`${head} text-right`}>B − A, points (95% interval)</th>
              <th className={`${head} text-right`}>McNemar p (A only / B only)</th>
              <th className={`${head} text-right`}>floor</th>
              <th className={head}>verdict</th>
            </tr>
          </thead>
          <tbody>
            {row("all shared tasks", c.overall)}
            {Object.entries(c.byCategory).map(([cat, r]) => row(cat, r, cat))}
          </tbody>
        </table>
      </div>
      <p className="mb-6 max-w-prose text-[12px] text-muted-foreground">
        A and B are success rates on the shared tasks ({a.report.triesPerTask} and {b.report.triesPerTask} tries each). The interval comes
        from resampling tasks, keeping each task&apos;s two results together. McNemar&apos;s test counts the tasks where most tries passed in
        only one run; p is the chance of a split that uneven if nothing really changed. Each category is judged against its own floor,
        which is wider because it has fewer tasks.
      </p>
    </>
  );
}

// Each shared task's tries in both runs: what the numbers above are made of.
function TaskTable({ result, category, here }: { result: RunComparison; category: string | null; here: (category?: string) => string }) {
  const { a, b } = result;
  const outcomes = (r: RunFiles) => {
    const rows = r.sealed ? r.trials.map(outcomeRow) : r.trials.map(outcomeRow);
    return { byTask: new Map(taskOutcomes(rows).map((t) => [t.taskId, t])), category: new Map(rows.map((x) => [x.taskId, x.category])) };
  };
  const oa = outcomes(a);
  const ob = outcomes(b);
  const ids = [...oa.byTask.keys()].filter((id) => ob.byTask.has(id) && (category === null || oa.category.get(id) === category)).sort();
  const cell = "px-3 py-1 align-top whitespace-nowrap";
  // A readable try links to its trajectory; a sealed holdout one doesn't.
  const tries = (r: RunFiles, id: string, t: { successes: number; tries: number }) =>
    !r.sealed ? (
      <Link href={`/runs/${r.report.runId}/${id}/1`} className="text-foreground hover:underline">
        {t.successes}/{t.tries}
      </Link>
    ) : (
      `${t.successes}/${t.tries}`
    );

  return (
    <section id="tasks" className="scroll-mt-4">
      <h2 className="mb-1 text-[13px] font-semibold">By task</h2>
      <p className="mb-2 text-[12px] text-muted-foreground">
        {category ? (
          <>
            The {ids.length} shared {category} tasks. <Link href={here()}>Show all</Link>
          </>
        ) : (
          `All ${ids.length} shared tasks.`
        )}{" "}
        Tries passed out of tries run, in each run.
      </p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-[12px]">
          <thead className="border-b text-muted-foreground">
            <tr>
              <th className={`${cell} font-normal`}>task</th>
              <th className={`${cell} font-normal`}>category</th>
              <th className={`${cell} text-right font-normal`}>A</th>
              <th className={`${cell} text-right font-normal`}>B</th>
              <th className={`${cell} text-right font-normal`}>change, points</th>
            </tr>
          </thead>
          <tbody>
            {ids.length === 0 && (
              <tr>
                <td colSpan={5} className={`${cell} text-muted-foreground`}>
                  No shared tasks in this category.
                </td>
              </tr>
            )}
            {ids.map((id) => {
              const ta = oa.byTask.get(id);
              const tb = ob.byTask.get(id);
              if (!ta || !tb) return null;
              const change = tb.successes / tb.tries - ta.successes / ta.tries;
              return (
                <tr key={id} className="border-b last:border-b-0 hover:bg-muted/60">
                  <td className={`${cell} font-mono`}>{id}</td>
                  <td className={cell}>{oa.category.get(id)}</td>
                  <td className={`${cell} text-right font-mono`}>{tries(a, id, ta)}</td>
                  <td className={`${cell} text-right font-mono`}>{tries(b, id, tb)}</td>
                  <td className={`${cell} text-right font-mono ${change === 0 ? "text-muted-foreground" : ""}`}>{points(change)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
