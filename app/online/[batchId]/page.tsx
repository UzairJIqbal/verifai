import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageHeading } from "@/components/shell/empty-state";
import { LoadError } from "@/components/runs/load-error";
import { formatWhen, STATUS_CLASS } from "@/components/runs/format";
import { RATE_LABELS, RateCell } from "@/components/online/rate";
import { readBatch, type BatchFiles } from "@/src/online/files";
import { ONLINE_RATES } from "@/src/online/schema";
import { conversationStatus } from "@/src/online/trial";

// From the address alone: the tab says which batch before its files are read.
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { batchId } = await params;
  return { title: `Batch ${batchId}` };
}

const cell = "px-3 py-1.5 align-top";
const num = `${cell} text-right tabular-nums`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

type Params = { batchId: string };

export default function BatchPage({ params }: { params: Promise<Params> }) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading the batch…</p>}>
      {params.then((p) => (
        <BatchView {...p} />
      ))}
    </Suspense>
  );
}

function BatchView({ batchId }: Params) {
  let files: BatchFiles | null;
  try {
    files = readBatch(batchId);
  } catch (error) {
    return (
      <>
        <PageHeading title={batchId} />
        <LoadError title="This batch can't be read." message={error instanceof Error ? error.message : String(error)} />
      </>
    );
  }
  if (files === null) notFound();
  const { batch, conversations } = files;

  return (
    <>
      <p className="mb-1 text-[12px]">
        <Link href="/online" className="text-link hover:underline">
          Online
        </Link>
      </p>
      <PageHeading title={batch.batchId} />

      <dl className="mb-4 grid max-w-[64rem] gap-x-6 gap-y-1 text-[12px] sm:grid-cols-[8rem_minmax(0,1fr)]">
        <dt className="text-muted-foreground">Ran</dt>
        <dd>
          {formatWhen(batch.createdAt)} to {formatWhen(batch.finishedAt)}
          {batch.stopped && <span className="text-fail">, stopped: {batch.stopped}</span>}
        </dd>
        <dt className="text-muted-foreground">Agent</dt>
        <dd>
          {batch.target.name}
          {batch.target.kind === "candidate" && " (a candidate, not promoted)"} <span className="text-muted-foreground">{batch.agent.label}</span>{" "}
          <span className="font-mono">{batch.agent.model}</span>
        </dd>
        <dt className="text-muted-foreground">Customer</dt>
        <dd>
          prompt {batch.customer.promptVersion}, temperature {batch.customer.temperature}, up to {batch.customer.maxTurns} turns
        </dd>
        <dt className="text-muted-foreground">Graded</dt>
        <dd>
          {batch.rates.graded} of {batch.rates.conversations} conversations ({pct(batch.sampleShare)} picked, {batch.rates.errored} errored)
          {batch.rates.claimsMissing > 0 && <span className="text-muted-foreground">, {batch.rates.claimsMissing} without claim checks</span>}
          {batch.rates.ungraded > 0 && <span className="text-fail">, {batch.rates.ungraded} with a grader that couldn&apos;t run</span>}
        </dd>
        {ONLINE_RATES.map((name) => (
          <div key={name} className="contents">
            <dt className="text-muted-foreground">{RATE_LABELS[name]}</dt>
            <dd className={name === "hallucination" && batch.alert ? "text-fail" : ""}>
              <RateCell rate={batch.rates.rates[name]} />
              {name === "hallucination" && <span className="text-muted-foreground"> (alert over {pct(batch.hallucinationThreshold)})</span>}
            </dd>
          </div>
        ))}
      </dl>

      {conversations.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">This batch has no conversations.</p>
      ) : (
        <div className="max-w-[72rem] overflow-x-auto rounded-md border">
          <table className="w-full text-[12px]">
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th className={`${cell} font-normal`}>#</th>
                <th className={`${cell} font-normal`}>Goal from</th>
                <th className={`${cell} font-normal`}>Persona</th>
                <th className={`${cell} font-normal`}>Ended</th>
                <th className={`${cell} text-right font-normal`}>Turns</th>
                <th className={`${cell} font-normal`}>Graded</th>
                <th className={`${cell} font-normal`}>Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {conversations.map((c) => {
                const status = conversationStatus(c);
                return (
                  <tr key={c.number}>
                    <td className={cell}>
                      <Link href={`/online/${batch.batchId}/${c.number}`} className="font-mono text-link hover:underline">
                        {c.number}
                      </Link>
                    </td>
                    <td className={`${cell} font-mono`}>
                      {c.templateId} <span className="font-sans text-muted-foreground">{c.category}</span>
                    </td>
                    <td className={cell}>{c.persona}</td>
                    <td className={cell}>{c.status === "errored" ? <span className="text-fail">errored</span> : c.end}</td>
                    <td className={num}>{c.turns}</td>
                    <td className={cell}>{c.sampled ? "yes" : <span className="text-muted-foreground">no</span>}</td>
                    <td className={cell}>
                      {!c.sampled || c.status === "errored" ? (
                        <span className="text-muted-foreground">–</span>
                      ) : c.flags.length === 0 ? (
                        <span className={STATUS_CLASS[status]}>none</span>
                      ) : (
                        <span className={STATUS_CLASS[status]}>{c.flags.join("; ")}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
