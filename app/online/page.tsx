import Link from "next/link";
import { EmptyState, PageHeading } from "@/components/shell/empty-state";
import { LoadError } from "@/components/runs/load-error";
import { formatWhen } from "@/components/runs/format";
import { RATE_LABELS, RateCell, rateText } from "@/components/online/rate";
import { RateChart } from "@/components/online/rates-chart";
import { listBatches, type BatchListing } from "@/src/online/files";
import { ONLINE_RATES, type Batch } from "@/src/online/schema";

const cell = "px-3 py-1.5 align-top";
const num = `${cell} text-right tabular-nums`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

// Read from results/online/, so this page is the same here and deployed.
export default function OnlinePage() {
  const heading = (
    <PageHeading title="Online">
      Simulated customers talking to the agent, one batch per <code>pnpm traffic</code>. A share of each batch is graded without an answer key: made-up records or actions,
      the policy rules, tool errors, loops, and the claim checker. Each point is one batch, with its 95% interval from resampling its graded conversations.
    </PageHeading>
  );
  let listing: BatchListing;
  try {
    listing = listBatches();
  } catch (error) {
    return (
      <>
        {heading}
        <LoadError title="The traffic batches can't be read." message={error instanceof Error ? error.message : String(error)} />
      </>
    );
  }
  const { batches, problems } = listing;
  const latest = batches.at(-1);
  return (
    <>
      {heading}
      {problems.map((m) => (
        <p key={m} className="mb-2 text-[12px] whitespace-pre-wrap text-fail">
          {m}
        </p>
      ))}
      {latest === undefined ? (
        <EmptyState title="No batches yet.">
          Run <code>pnpm traffic</code>. It shows what it will spend and asks before sending anything.
        </EmptyState>
      ) : (
        <>
          {latest.alert && <AlertBanner batch={latest} />}
          <div className="mb-2 grid max-w-[72rem] gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ONLINE_RATES.map((name) => (
              <RateChart
                key={name}
                title={RATE_LABELS[name]}
                threshold={name === "hallucination" ? latest.hallucinationThreshold : null}
                points={batches.map((b) => {
                  const r = b.rates.rates[name];
                  return { label: b.createdAt.slice(5, 16).replace("T", " "), value: r.estimate?.value ?? null, lo: r.estimate?.lo ?? null, hi: r.estimate?.hi ?? null, of: r.of };
                })}
              />
            ))}
          </div>
          <p className="mb-4 text-[11px] text-muted-foreground">
            Under each point: the batch&apos;s start (UTC) and how many graded conversations the rate is over. The dashed line is the hallucination alert threshold (
            {pct(latest.hallucinationThreshold)}).
          </p>
          <BatchTable batches={[...batches].reverse()} />
        </>
      )}
    </>
  );
}

function AlertBanner({ batch }: { batch: Batch }) {
  return (
    <div role="alert" className="mb-4 max-w-[72rem] rounded-md border border-fail/40 bg-fail/5 px-4 py-2 text-[12px]">
      <span className="font-medium text-fail">Hallucination is over the {pct(batch.hallucinationThreshold)} threshold</span> in the latest batch:{" "}
      {rateText(batch.rates.rates.hallucination)}.{" "}
      <Link href={`/online/${batch.batchId}`} className="text-link hover:underline">
        See its conversations
      </Link>{" "}
      or read the flagged ones in the review queue.
    </div>
  );
}

function BatchTable({ batches }: { batches: Batch[] }) {
  return (
    <div className="max-w-[80rem] overflow-x-auto rounded-md border">
      <table className="w-full text-[12px]">
        <thead className="border-b text-left text-muted-foreground">
          <tr>
            <th className={`${cell} font-normal`}>Batch</th>
            <th className={`${cell} font-normal`}>Agent</th>
            <th className={`${cell} text-right font-normal`}>Conversations</th>
            <th className={`${cell} text-right font-normal`}>Graded</th>
            {ONLINE_RATES.map((name) => (
              <th key={name} className={`${cell} font-normal`}>
                {RATE_LABELS[name]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {batches.map((b) => (
            <tr key={b.batchId}>
              <td className={cell}>
                <Link href={`/online/${b.batchId}`} className="font-mono text-link hover:underline">
                  {b.batchId}
                </Link>
                <div className="text-muted-foreground">{formatWhen(b.createdAt)}</div>
                {b.stopped && <div className="text-fail">stopped: {b.stopped}</div>}
              </td>
              <td className={cell}>
                {b.target.name}
                {b.target.kind === "candidate" && <span className="text-muted-foreground"> (candidate)</span>}
                <div className="text-muted-foreground">{b.agent.label}</div>
              </td>
              <td className={num}>
                {b.rates.conversations}
                {b.rates.errored > 0 && <div className="text-fail">{b.rates.errored} errored</div>}
              </td>
              <td className={num}>
                {b.rates.graded}
                {b.rates.claimsMissing > 0 && <div className="text-muted-foreground">{b.rates.claimsMissing} no claims</div>}
                {b.rates.ungraded > 0 && <div className="text-fail">{b.rates.ungraded} couldn&apos;t grade</div>}
              </td>
              {ONLINE_RATES.map((name) => (
                <td key={name} className={`${cell} ${name === "hallucination" && b.alert ? "text-fail" : ""}`}>
                  <RateCell rate={b.rates.rates[name]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
