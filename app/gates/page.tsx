import Link from "next/link";
import { EmptyState, PageHeading } from "@/components/shell/empty-state";
import { listGates } from "@/src/gate/record";
import type { GateRecord, GateRow } from "@/src/gate/schema";
import { CATEGORIES } from "@/src/tasks/schema";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const pts = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}`;
const p = (x: number) => (x < 0.001 ? "< 0.001" : x.toFixed(3));
const cell = "px-3 py-1.5 align-top";
const num = `${cell} text-right tabular-nums`;

const VERDICT: Record<GateRow["verdict"], { text: string; tone: string }> = {
  better: { text: "better", tone: "text-pass" },
  worse: { text: "worse", tone: "text-fail" },
  "within-noise": { text: "within noise", tone: "text-noise" },
  "no-noise-floor": { text: "no floor", tone: "text-muted-foreground" },
};

function Rows({ split, c, tries, minDrop }: { split: string; c: GateRecord["dev"]; tries: number; minDrop: number }) {
  const rows: [string, GateRow][] = [["all", c.overall], ...CATEGORIES.flatMap((cat): [string, GateRow][] => (c.byCategory[cat] ? [[cat, c.byCategory[cat]]] : []))];
  return rows.map(([label, r], i) => (
    <tr key={`${split}-${label}`} className={i === 0 ? "font-medium" : undefined}>
      <td className={cell}>{i === 0 ? split : ""}</td>
      <td className={cell}>{label}</td>
      <td className={num}>
        {r.tasks} × {tries}
      </td>
      <td className={num}>{pct(r.aRate)}</td>
      <td className={num}>{pct(r.bRate)}</td>
      <td className={num}>{pts(r.difference.value)}</td>
      <td className={`${num} text-muted-foreground`}>
        [{pts(r.difference.lo)}, {pts(r.difference.hi)}]
      </td>
      <td className={num}>{p(r.p)}</td>
      <td className={`${num} text-muted-foreground`}>
        {r.floor === null ? "–" : (r.floor * 100).toFixed(1)}
        {r.floor !== null && split === "holdout" && " (estimated from dev)"}
      </td>
      {/* Records from before D-002 held every category to the flat minimum. */}
      <td className={`${num} text-muted-foreground`}>{i === 0 ? "–" : (r.dropLimit ?? minDrop).toFixed(1)}</td>
      <td className={`${cell} ${VERDICT[r.verdict].tone}`}>{VERDICT[r.verdict].text}</td>
    </tr>
  ));
}

function Gate({ g }: { g: GateRecord }) {
  const runLink = (id: string) => (
    <Link href={`/runs/${id}`} className="font-mono text-link hover:underline">
      {id}
    </Link>
  );
  return (
    <section className="mb-8">
      <h2 className="text-[15px] font-semibold">
        {g.name} against {g.basedOn}:{" "}
        <span className={g.passed ? "text-pass" : "text-fail"}>{g.passed ? (g.promoted ? "passed, promoted" : "passed, promotion incomplete") : "failed, nothing changed"}</span>
      </h2>
      <p className="mt-1 text-[12px] text-muted-foreground">
        {g.decidedAt.slice(0, 16).replace("T", " ")} UTC · dataset {g.datasetVersion} · {g.change} · targets <span className="font-mono">{g.targets}</span>
        {g.targets !== g.topCategory && <span className="text-fail"> (top was {g.topCategory})</span>}
      </p>
      <p className="mt-1 max-w-prose">{g.why}</p>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Noise floor {(g.floor.overall * 100).toFixed(1)} points measured {g.floor.measuredAt.slice(0, 10)} on dataset {g.floor.datasetVersion} ({g.floor.tasks} tasks, configuration{" "}
        <span className="font-mono">{g.floor.configKey}</span>), rescaled to each row&apos;s task count. Holdout floors are estimated from dev: holdout is never run twice to
        measure its own.
      </p>

      <div className="mt-2 max-w-[72rem] overflow-x-auto rounded-md border">
        <table className="w-full text-[12px]">
          <thead className="border-b text-left text-muted-foreground">
            <tr>
              <th className={`${cell} font-normal`}>Split</th>
              <th className={`${cell} font-normal`}>Slice</th>
              <th className={`${cell} text-right font-normal`}>Tasks × tries</th>
              <th className={`${cell} text-right font-normal`}>{g.basedOn}</th>
              <th className={`${cell} text-right font-normal`}>{g.name}</th>
              <th className={`${cell} text-right font-normal`}>Change, points</th>
              <th className={`${cell} text-right font-normal`}>95% interval</th>
              <th className={`${cell} text-right font-normal`}>McNemar p</th>
              <th className={`${cell} text-right font-normal`}>Floor</th>
              <th className={`${cell} text-right font-normal`} title="How far this category could drop before the gate failed it">
                Drop limit
              </th>
              <th className={`${cell} font-normal`}>Verdict</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <Rows split="holdout" c={g.holdout} tries={g.triesPerTask} minDrop={g.maxCategoryDropPoints} />
            <Rows split="dev" c={g.dev} tries={g.triesPerTask} minDrop={g.maxCategoryDropPoints} />
          </tbody>
        </table>
      </div>

      <ul className="mt-2 space-y-0.5 text-[12px]">
        {g.checks.map((c) => (
          <li key={c.id}>
            <span className={`inline-block w-9 ${c.pass ? "text-pass" : "text-fail"}`}>{c.pass ? "pass" : "fail"}</span>
            {c.label} <span className="text-muted-foreground">({c.detail})</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-muted-foreground">
        Runs: dev {runLink(g.runs.promotedDev)} → {runLink(g.runs.candidateDev)}; holdout {runLink(g.runs.promotedHoldout)} → {runLink(g.runs.candidateHoldout)}
        {g.promoted ? "" : " (holdout tries sealed)"}.
      </p>
    </section>
  );
}

// Read from results/gates/, so this page is the same here and deployed.
export default function GatesPage() {
  const heading = (
    <PageHeading title="Gates">
      Each candidate against the promoted version on dev and holdout. A candidate passes only if holdout success beats the noise floor with McNemar agreeing, and no category
      drops more than its limit on either split: the larger of the set minimum and the promoted version&apos;s noise floor for that category. McNemar p is the chance of a split of task outcomes this uneven if nothing had really changed.
    </PageHeading>
  );
  let listing;
  try {
    listing = listGates();
  } catch (error) {
    return (
      <>
        {heading}
        <div className="rounded-lg border border-fail/40 px-5 py-6">
          <p className="font-medium text-fail">The gate records can&apos;t be read.</p>
          <p className="mt-1 max-w-prose whitespace-pre-wrap text-muted-foreground">{error instanceof Error ? error.message : String(error)}</p>
        </div>
      </>
    );
  }
  const { gates, problems } = listing;
  return (
    <>
      {heading}
      {problems.map((m) => (
        <p key={m} className="mb-2 whitespace-pre-wrap text-[12px] text-fail">
          {m}
        </p>
      ))}
      {gates.length === 0 ? (
        <EmptyState title="No gates run yet.">
          Write a candidate in <code>agent/candidates/</code>, then run <code>pnpm gate &lt;name&gt;</code>.
        </EmptyState>
      ) : (
        gates.map((g) => <Gate key={`${g.decidedAt}-${g.name}`} g={g} />)
      )}
    </>
  );
}
