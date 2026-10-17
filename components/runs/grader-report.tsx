import type { ReactNode } from "react";
import Link from "next/link";
import type { GraderReport } from "@/src/results/schema";
import { flipped, interval, pct } from "@/src/stats/format";
import type { Estimate } from "@/src/stats/stats";
import { linkClass, trialsHref } from "./run-stats";

export const cell = "px-3 py-1.5 align-top whitespace-nowrap";
const head = `${cell} font-normal`;
export const num = `${cell} text-right font-mono`;

// A count that opens the tries behind it; zero has no tries to open.
export function Count({ value, of, href }: { value: number; of?: number; href: string | null }) {
  const text = of === undefined ? String(value) : `${value}/${of}`;
  if (href === null || value === 0) return <span className={value === 0 ? "text-muted-foreground" : ""}>{text}</span>;
  return (
    <Link href={href} className={linkClass}>
      {text}
    </Link>
  );
}

export function Rate({ e, href }: { e: Estimate | null; href: string | null }) {
  if (e === null) return <span className="text-muted-foreground">–</span>;
  const body = (
    <>
      <span>{pct(e.value)}</span>
      <span className="block text-[11px] text-muted-foreground">{interval(e)}</span>
    </>
  );
  return href === null ? body : <Link href={href} className={linkClass}>{body}</Link>;
}

function Mean({ e }: { e: Estimate | null }) {
  if (e === null) return <span className="text-muted-foreground">–</span>;
  return (
    <>
      <span>{e.value.toFixed(2)}</span>
      <span className="block text-[11px] text-muted-foreground">
        {e.lo.toFixed(2)}–{e.hi.toFixed(2)}
      </span>
    </>
  );
}

export function Table({ title, note, header, children }: { title: string; note: string; header: string[]; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <h3 className="mb-0.5 text-[12px] font-medium">{title}</h3>
      <p className="mb-1.5 text-[11px] text-muted-foreground">{note}</p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-[12px]">
          <thead className="border-b text-muted-foreground">
            <tr>
              {header.map((h, i) => (
                <th key={h} className={`${head} ${i === 0 ? "" : "text-right"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export const rowClass = "border-b last:border-b-0 hover:bg-muted/60";

/**
 * How the tries got to their results: every grader's pass rate, policy
 * violations, tool precision and recall, and wasted steps. Reported beside the
 * success rate, never part of it. With `linked`, each count opens its tries;
 * a holdout run's tries can't be opened, so it isn't.
 */
export function GraderReportSection({ runId, g, linked }: { runId: string; g: GraderReport; linked: boolean }) {
  const href = (tag: string) => (linked ? trialsHref(runId, { tag }) : null);
  const outcome = g.graders.filter((r) => r.grader === "state" || r.grader === "reply");
  const policy = g.graders.filter((r) => r.grader.startsWith("policy:"));
  const others = g.graders.filter((r) => !outcome.includes(r) && !policy.includes(r));
  const graderRow = (r: GraderReport["graders"][number]) => (
    <tr key={r.grader} className={rowClass}>
      <td className={`${cell} font-mono`}>{r.grader}</td>
      <td className={num}>{r.tasks}</td>
      <td className={num}>{r.graded}</td>
      <td className={num}>
        <Count value={r.graded - r.passed} of={r.graded} href={href(`fail:${r.grader}`)} />
      </td>
      <td className={`${num} ${r.ungraded > 0 ? "text-fail" : ""}`}>
        <Count value={r.ungraded} href={href(`ungraded:${r.grader}`)} />
      </td>
      <td className={num}>
        <Rate e={r.rate} href={href(`fail:${r.grader}`)} />
      </td>
    </tr>
  );

  return (
    <section className="mb-6" aria-labelledby="graders-heading">
      <h2 id="graders-heading" className="mb-0.5 text-[13px] font-medium">
        Trajectory graders
      </h2>
      <p className="mb-3 max-w-prose text-[12px] text-muted-foreground">
        How each try got to its result. Only state and reply decide whether a try passed; the rest are reported beside them. From {g.tasks}{" "}
        tasks, {g.tries} tries{g.errored > 0 ? `; ${g.errored} errored tries had nothing to grade` : ""}. Rates are averaged over tasks
        with 95% intervals. A grader that couldn&apos;t run on a try is counted apart, never as a pass.
      </p>

      <div className="grid gap-5 xl:grid-cols-2">
        <Table title="Pass rate per grader" note="Over the tries each grader could grade." header={["grader", "tasks", "graded", "failed", "couldn't grade", "pass rate"]}>
          {outcome.map(graderRow)}
          <tr className="border-b bg-muted/40">
            <td colSpan={6} className={`${cell} text-[11px] text-muted-foreground`}>
              reported beside the outcome
            </td>
          </tr>
          {others.map(graderRow)}
          {policy.map(graderRow)}
        </Table>

        <div className="grid content-start gap-5">
          <Table title="Policy violations" note="A try violates the policy when any of the eight rules fails on it." header={["rule", "tasks", "graded", "violated", "violation rate"]}>
            <tr className={rowClass}>
              <td className={cell}>any rule</td>
              <td className={num}>{g.policy.tasks}</td>
              <td className={num}>{g.policy.tries}</td>
              <td className={num}>
                <Count value={g.policy.violated} of={g.policy.tries} href={href("policy-violation")} />
              </td>
              <td className={num}>
                <Rate e={g.policy.rate} href={href("policy-violation")} />
              </td>
            </tr>
            {policy.map((r) => (
              <tr key={r.grader} className={rowClass}>
                <td className={`${cell} font-mono`}>{r.grader.replace("policy:", "")}</td>
                <td className={num}>{r.tasks}</td>
                <td className={num}>{r.graded}</td>
                <td className={num}>
                  <Count value={r.graded - r.passed} of={r.graded} href={href(`fail:${r.grader}`)} />
                </td>
                <td className={num}>
                  <Rate e={flipped(r.rate)} href={href(`fail:${r.grader}`)} />
                </td>
              </tr>
            ))}
          </Table>

          <Table
            title="Efficiency"
            note={`Over the ${g.efficiency.tries} tries (${g.efficiency.tasks} tasks) whose task has reference calls. A loop is the same call with the same input again, with nothing changed in between.`}
            header={["", "average or rate"]}
          >
            <tr className={rowClass}>
              <td className={cell}>tool calls per try</td>
              <td className={num}>
                <Mean e={g.efficiency.toolCalls} />
              </td>
            </tr>
            <tr className={rowClass}>
              <td className={cell}>reference calls per try</td>
              <td className={num}>
                <Mean e={g.efficiency.reference} />
              </td>
            </tr>
            <tr className={rowClass}>
              <td className={cell}>
                loop rate · <Count value={g.efficiency.loops} href={href("fail:loop")} /> tries looped
              </td>
              <td className={num}>
                <Rate e={g.efficiency.loopRate} href={href("fail:loop")} />
              </td>
            </tr>
          </Table>
        </div>

        <div className="xl:col-span-2">
          <Table
            title="Tool choice"
            note="Counted in tries. Precision: of the tries that called a tool, the share that needed it. Recall: of the tries that needed it, the share that called it. Needed means the task's reference calls it."
            header={["tool", "called", "needed", "both", "called, not needed", "needed, not called", "precision", "recall"]}
          >
            {g.tools.map((t) => (
              <tr key={t.tool} className={rowClass}>
                <td className={`${cell} font-mono`}>{t.tool}</td>
                <td className={num}>
                  <Count value={t.called} href={href(`called:${t.tool}`)} />
                </td>
                <td className={num}>
                  <Count value={t.expected} href={href(`expected:${t.tool}`)} />
                </td>
                <td className={num}>
                  <Count value={t.both} href={href(`right:${t.tool}`)} />
                </td>
                <td className={num}>
                  <Count value={t.called - t.both} href={href(`wrong:${t.tool}`)} />
                </td>
                <td className={num}>
                  <Count value={t.expected - t.both} href={href(`missed:${t.tool}`)} />
                </td>
                <td className={num}>
                  <Rate e={t.precision} href={href(`called:${t.tool}`)} />
                </td>
                <td className={num}>
                  <Rate e={t.recall} href={href(`expected:${t.tool}`)} />
                </td>
              </tr>
            ))}
          </Table>
        </div>
      </div>
    </section>
  );
}
