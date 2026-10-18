import type { JudgeReport } from "@/src/results/schema";
import { JUDGE_CRITERION_TEXT, judgeCoverage } from "@/src/results/judge-text";
import { cell, Count, num, Rate, rowClass, Table } from "./grader-report";
import { trialsHref } from "./run-stats";

/**
 * The AI judge's pass rates, one row per criterion, apart from the success
 * rate. Each failure count opens the tries that failed it. Null `j` means the
 * judge hasn't read the run yet.
 */
export function JudgeSection({ runId, j }: { runId: string; j: JudgeReport | null }) {
  return (
    <section className="mb-6" aria-labelledby="judge-heading">
      <h2 id="judge-heading" className="mb-0.5 text-[13px] font-medium">
        AI judge
      </h2>
      {j === null ? (
        <p className="max-w-prose text-[12px] text-muted-foreground">
          The AI judge hasn&apos;t read this run. Run <span className="font-mono">pnpm judge {runId}</span>; it prints how many judge calls it needs
          before sending any (about one per try with a reply).
        </p>
      ) : (
        <>
          <p className="mb-3 max-w-prose text-[12px] text-muted-foreground">
            Pass or fail per criterion. Each criterion counts only the tries it was asked about. Rates are averaged over tasks with 95% intervals.{" "}
            {judgeCoverage(j)}
          </p>
          <Table title="Judge verdicts" note="Reported beside the success rate, never part of it." header={["", "tasks", "tries", "passed", "failed", "pass rate"]}>
            {j.criteria.map((c) => (
              <tr key={c.criterion} className={rowClass}>
                <td className={cell}>{JUDGE_CRITERION_TEXT[c.criterion].name}</td>
                <td className={num}>{c.tasks}</td>
                <td className={num}>{c.tries}</td>
                <td className={num}>
                  {c.passed}/{c.tries}
                </td>
                <td className={num}>
                  <Count value={c.tries - c.passed} href={trialsHref(runId, { tag: `judge:fail:${c.criterion}` })} />
                </td>
                <td className={num}>
                  <Rate e={c.rate} href={null} />
                </td>
              </tr>
            ))}
            {j.ungraded > 0 && (
              <tr className={rowClass}>
                <td className={`${cell} text-fail`}>judge couldn&apos;t grade</td>
                <td colSpan={5} className={`${num} text-fail`}>
                  <Count value={j.ungraded} href={trialsHref(runId, { tag: "ungraded:judge" })} /> tries
                </td>
              </tr>
            )}
          </Table>
          <dl className="mt-2 grid max-w-[64rem] gap-x-4 gap-y-1 text-[11px] text-muted-foreground sm:grid-cols-[11rem_minmax(0,1fr)]">
            {j.criteria.map((c) => (
              <div key={c.criterion} className="contents">
                <dt>{JUDGE_CRITERION_TEXT[c.criterion].name}</dt>
                <dd>{JUDGE_CRITERION_TEXT[c.criterion].asks}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}
