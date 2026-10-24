import Link from "next/link";
import type { ReactNode } from "react";
import { ImprovementChart, PAGE_PALETTE, usd } from "@/components/improvement/improvement-chart";
import { EmptyState, PageHeading } from "@/components/shell/empty-state";
import { gateAnchor, type GateRecord } from "@/src/gate/schema";
import { loadImprovement } from "@/src/improvement/load";
import type { Improvement, Measured, Sample, VersionPoint } from "@/src/improvement/series";
import { trialKey } from "@/src/review/schema";
import { interval, pct, sampleSize } from "@/src/stats/format";

const cell = "px-3 py-1.5 align-top";
const num = `${cell} text-right tabular-nums`;

const RunLink = ({ id }: { id: string }) => (
  <Link href={`/runs/${id}`} className="font-mono text-link hover:underline">
    {id}
  </Link>
);

const GateLink = ({ g, children }: { g: GateRecord; children: ReactNode }) => (
  <Link href={`/gates#${gateAnchor(g)}`} className="text-link hover:underline">
    {children}
  </Link>
);

// A measure's value, interval and sample, or why there isn't one.
function MeasureCell({ m, format, runId }: { m: Measured<Sample>; format: "rate" | "usd"; runId: string }) {
  if (!m.ok) {
    return (
      <td className={`${cell} max-w-64 text-[11px] text-muted-foreground`}>
        not measured: {m.reason}
      </td>
    );
  }
  const e = m.estimate;
  const shown = format === "rate" ? `${pct(e.value)} [${interval(e)}]` : `${usd(e.value)} [${usd(e.lo)}–${usd(e.hi)}]`;
  return (
    <td className={num}>
      {shown}
      <div className="text-[11px] text-muted-foreground">
        {sampleSize(m)} · <RunLink id={runId} />
      </div>
    </td>
  );
}

function VersionTable({ versions }: { versions: VersionPoint[] }) {
  return (
    <div className="mt-4 max-w-[72rem] overflow-x-auto rounded-md border">
      <table className="w-full text-[12px]">
        <thead className="border-b text-left text-muted-foreground">
          <tr>
            <th className={`${cell} font-normal`}>Version</th>
            <th className={`${cell} font-normal`}>Dataset</th>
            <th className={`${cell} text-right font-normal`}>Holdout success</th>
            <th className={`${cell} text-right font-normal`}>Replies with a hallucination</th>
            <th className={`${cell} text-right font-normal`}>Cost per success</th>
            <th className={`${cell} text-right font-normal`}>Failures reviewed</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {versions.map((v) => (
            <tr key={v.version}>
              <td className={cell}>
                <span className="font-mono font-medium">{v.version}</span>
                <div className="text-[11px] text-muted-foreground">{v.label}</div>
                {v.gate && (
                  <div className="text-[11px]">
                    <GateLink g={v.gate}>gate of {v.gate.decidedAt.slice(0, 10)}</GateLink>
                  </div>
                )}
              </td>
              <td className={`${cell} font-mono`}>{v.datasetVersion}</td>
              <MeasureCell m={v.holdout} format="rate" runId={v.holdoutRunId} />
              <MeasureCell m={v.hallucination} format="rate" runId={v.devRunId} />
              <MeasureCell m={v.cost} format="usd" runId={v.devRunId} />
              {v.categories.ok ? (
                <td className={num}>
                  {v.categories.reviewed} of {v.categories.failures}
                  {v.categories.notReviewed > 0 && (
                    <div className="text-[11px] text-muted-foreground">
                      review the rest on <Link href="/review" className="text-link hover:underline">/review</Link> (local only)
                    </div>
                  )}
                </td>
              ) : (
                <td className={`${cell} max-w-64 text-[11px] text-muted-foreground`}>not counted: {v.categories.reason}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// For each promoted version: the failures it was aimed at, how they were
// tagged, what changed, and the gate that let it through.
function Chain({ versions }: { versions: VersionPoint[] }) {
  const names = new Map(versions.flatMap((v) => (v.categories.ok ? v.categories.rows.map((r) => [r.id, r.name] as const) : [])));
  const later = versions.filter((v): v is VersionPoint & { gate: GateRecord } => v.gate !== null);
  return (
    <section className="mt-8">
      <h2 className="text-[15px] font-semibold">Where each fix came from</h2>
      <ol className="mt-2 max-w-[72rem] space-y-3">
        {later.map((v) => (
          <li key={v.version} className="rounded-md border px-4 py-3">
            <p>
              <span className="font-mono font-medium">{v.version}</span> on top of <span className="font-mono">{v.gate.basedOn}</span>, aimed at{" "}
              <span className="font-medium">{names.get(v.gate.targets) ?? v.gate.targets}</span> <span className="font-mono text-muted-foreground">({v.gate.targets})</span>
            </p>
            <p className="mt-1 text-[12px]">
              <span className="text-muted-foreground">Failed tries of {v.gate.basedOn} tagged with it: </span>
              {v.examples.length === 0 ? (
                <span className="text-muted-foreground">none found among the reviewed notes on {v.gate.basedOn}&apos;s configuration.</span>
              ) : (
                v.examples.map((e, i) => (
                  <span key={trialKey(e)}>
                    {i > 0 && ", "}
                    <Link href={`/runs/${e.runId}/${e.taskId}/${e.tryNumber}`} className="font-mono text-link hover:underline">
                      {e.taskId} try {e.tryNumber}
                    </Link>
                  </span>
                ))
              )}
            </p>
            <p className="mt-1 text-[12px]">
              <span className="text-muted-foreground">Change: </span>
              {v.gate.change}. <span className="text-muted-foreground">{v.gate.why}</span>
            </p>
            <p className="mt-1 text-[12px]">
              <GateLink g={v.gate}>
                Gate {v.gate.decidedAt.slice(0, 16).replace("T", " ")} UTC: passed, promoted
              </GateLink>
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function NotPromoted({ gates }: { gates: GateRecord[] }) {
  if (gates.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-[15px] font-semibold">Tried and not promoted</h2>
      <p className="max-w-prose text-[12px] text-muted-foreground">Candidates the gate turned down. They count as tries, not iterations, and aren&apos;t drawn above.</p>
      <ul className="mt-2 space-y-1 text-[12px]">
        {gates.map((g) => (
          <li key={gateAnchor(g)}>
            <GateLink g={g}>
              <span className="font-mono">{g.name}</span> on {g.decidedAt.slice(0, 10)}
            </GateLink>{" "}
            <span className="text-fail">{g.passed ? "passed, promotion incomplete" : "failed"}</span> · aimed at <span className="font-mono">{g.targets}</span> · {g.change}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Read from results/ and evals/review/, so this page is the same here and
// deployed, and `pnpm chart` draws the same picture from the same files.
export default function ImprovementPage() {
  const heading = (
    <PageHeading title="Improvement">
      Every version the gate promoted, each measured on the runs of the gate that promoted it: holdout success from its holdout run, the rest from its dev run. Cost counts the
      agent, the claim checker and the judge, over the tries that passed. The bars count failed dev tries by the category you gave them on the review page.
    </PageHeading>
  );
  let data: Improvement;
  try {
    data = loadImprovement();
  } catch (error) {
    return (
      <>
        {heading}
        <div className="rounded-lg border border-fail/40 px-5 py-6">
          <p className="font-medium text-fail">The gate records, runs or review files can&apos;t be read.</p>
          <p className="mt-1 max-w-prose whitespace-pre-wrap text-muted-foreground">{error instanceof Error ? error.message : String(error)}</p>
        </div>
      </>
    );
  }
  const { versions, notPromoted, problems } = data;
  return (
    <>
      {heading}
      {problems.map((m) => (
        <p key={m} className="mb-2 max-w-prose whitespace-pre-wrap text-[12px] text-fail">
          {m}
        </p>
      ))}
      {versions.length === 0 ? (
        <EmptyState title="No version has been promoted yet.">
          Run a candidate through the gate with <code>pnpm gate &lt;name&gt;</code>. Once one passes, the version it started from and the new one appear here.
        </EmptyState>
      ) : (
        <>
          <div className="max-w-[60rem] rounded-md border p-2">
            <ImprovementChart versions={versions} palette={PAGE_PALETTE} />
          </div>
          <p className="mt-1 max-w-prose text-[12px] text-muted-foreground">
            The same chart as an image for the README: <code>pnpm chart</code> writes <code>docs/improvement.svg</code>.
          </p>
          <VersionTable versions={versions} />
          <Chain versions={versions} />
        </>
      )}
      <NotPromoted gates={notPromoted} />
    </>
  );
}
