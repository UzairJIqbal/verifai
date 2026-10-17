import type { HallucinationReport } from "@/src/results/schema";
import { claimCoverage, HALLUCINATION_DEFINITIONS } from "@/src/results/hallucination-text";
import { cell, Count, num, Rate, rowClass, Table } from "./grader-report";
import { trialsHref } from "./run-stats";

/**
 * The four hallucination rates. The two code checks run on every try; the
 * claim rates fill in once `pnpm claims` has read the run. With `linked`,
 * each count opens its tries; a holdout run's can't be opened.
 */
export function HallucinationSection({ runId, h, linked }: { runId: string; h: HallucinationReport; linked: boolean }) {
  const href = (tag: string) => (linked ? trialsHref(runId, { tag }) : null);
  const c = h.claims;
  const notRead = (
    <td colSpan={3} className={`${cell} text-muted-foreground`}>
      not checked yet: run <span className="font-mono">pnpm claims {runId}</span>
    </td>
  );
  return (
    <section className="mb-6" aria-labelledby="hallucination-heading">
      <h2 id="hallucination-heading" className="mb-0.5 text-[13px] font-medium">
        Hallucination
      </h2>
      <p className="mb-3 max-w-prose text-[12px] text-muted-foreground">
        Rates are averaged over tasks with 95% intervals; the reply and claim rates pool each task&apos;s replies or claims first. {claimCoverage(h)}
      </p>
      <Table title="Hallucination rates" note="Reported beside the success rate, never part of it." header={["", "tasks", "tries", "count", "rate"]}>
        <tr className={rowClass}>
          <td className={cell}>fabricated entity</td>
          <td className={num}>{h.fabricatedEntity.tasks}</td>
          <td className={num}>{h.fabricatedEntity.tries}</td>
          <td className={num}>
            <Count value={h.fabricatedEntity.hits} of={h.fabricatedEntity.tries} href={href("fail:fabricated-entity")} /> tries
          </td>
          <td className={num}>
            <Rate e={h.fabricatedEntity.rate} href={href("fail:fabricated-entity")} />
          </td>
        </tr>
        <tr className={rowClass}>
          <td className={cell}>fabricated action</td>
          <td className={num}>{h.fabricatedAction.tasks}</td>
          <td className={num}>{h.fabricatedAction.tries}</td>
          <td className={num}>
            <Count value={h.fabricatedAction.hits} of={h.fabricatedAction.tries} href={href("fail:fabricated-action")} /> tries
          </td>
          <td className={num}>
            <Rate e={h.fabricatedAction.rate} href={href("fail:fabricated-action")} />
          </td>
        </tr>
        <tr className={rowClass}>
          <td className={cell}>replies with a bad claim</td>
          {c === null ? (
            notRead
          ) : (
            <>
              <td className={num}>{c.responses.tasks}</td>
              <td className={num}>{c.responses.tries}</td>
              <td className={num}>
                <Count value={c.responses.flagged} of={c.responses.replies} href={href("claims:flagged")} /> replies
              </td>
            </>
          )}
          <td className={num}>{c === null ? <span className="text-muted-foreground">–</span> : <Rate e={c.responses.rate} href={href("claims:flagged")} />}</td>
        </tr>
        <tr className={rowClass}>
          <td className={cell}>unsupported claims</td>
          {c === null ? (
            notRead
          ) : (
            <>
              <td className={num}>{c.claims.tasks}</td>
              <td className={num}>{c.claims.tries}</td>
              <td className={num}>
                <Count value={c.claims.unsupported} of={c.claims.total} href={href("claims:unsupported")} /> claims ·{" "}
                <Count value={c.claims.contradicted} href={href("claims:contradicted")} /> contradicted
              </td>
            </>
          )}
          <td className={num}>{c === null ? <span className="text-muted-foreground">–</span> : <Rate e={c.claims.rate} href={href("claims:unsupported")} />}</td>
        </tr>
        {c !== null && c.ungraded > 0 && (
          <tr className={rowClass}>
            <td className={`${cell} text-fail`}>claim checker couldn&apos;t grade</td>
            <td colSpan={4} className={`${num} text-fail`}>
              <Count value={c.ungraded} href={href("ungraded:claims")} /> tries
            </td>
          </tr>
        )}
      </Table>
      <dl className="mt-2 grid max-w-[64rem] gap-x-4 gap-y-1 text-[11px] text-muted-foreground sm:grid-cols-[11rem_minmax(0,1fr)]">
        <dt>fabricated entity</dt>
        <dd>{HALLUCINATION_DEFINITIONS.fabricatedEntity}</dd>
        <dt>fabricated action</dt>
        <dd>{HALLUCINATION_DEFINITIONS.fabricatedAction}</dd>
        <dt>replies with a bad claim</dt>
        <dd>{HALLUCINATION_DEFINITIONS.responses}</dd>
        <dt>unsupported claims</dt>
        <dd>{HALLUCINATION_DEFINITIONS.claims}</dd>
      </dl>
    </section>
  );
}
