import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/shell/empty-state";
import { LoadError } from "@/components/runs/load-error";
import { countedTokens, formatCount, STATUS_CLASS } from "@/components/runs/format";
import { TrajectorySteps } from "@/components/runs/trajectory-steps";
import { VerdictSummary } from "@/components/runs/verdicts";
import { readBatch, type BatchFiles } from "@/src/online/files";
import type { Conversation } from "@/src/online/schema";
import { conversationStatus, conversationTrial } from "@/src/online/trial";

type Params = { batchId: string; number: string };

export default function ConversationPage({ params }: { params: Promise<Params> }) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading the conversation…</p>}>
      {params.then((p) => (
        <ConversationView {...p} />
      ))}
    </Suspense>
  );
}

function ConversationView({ batchId, number }: Params) {
  let files: BatchFiles | null;
  try {
    files = readBatch(batchId);
  } catch (error) {
    return (
      <>
        <PageHeading title={`${batchId}, conversation ${number}`} />
        <LoadError title="This batch can't be read." message={error instanceof Error ? error.message : String(error)} />
      </>
    );
  }
  if (files === null) notFound();
  const c = files.conversations.find((x) => String(x.number) === number);
  if (!c) notFound();
  const status = conversationStatus(c);

  return (
    <>
      <p className="mb-1 text-[12px]">
        <Link href="/online" className="text-link hover:underline">
          Online
        </Link>
        <span className="text-muted-foreground"> / </span>
        <Link href={`/online/${batchId}`} className="font-mono text-link hover:underline">
          {batchId}
        </Link>
      </p>
      <PageHeading title={`Conversation ${c.number}`} />

      <dl className="mb-4 grid max-w-[64rem] gap-x-6 gap-y-1 text-[12px] sm:grid-cols-[8rem_minmax(0,1fr)]">
        <dt className="text-muted-foreground">Customer</dt>
        <dd>
          {c.persona}, with a goal from <span className="font-mono">{c.templateId}</span>{" "}
          <span className="text-muted-foreground">
            ({c.category}, {c.difficulty})
          </span>
        </dd>
        <dt className="text-muted-foreground">Ended</dt>
        <dd>
          {c.status === "errored" ? <span className="text-fail">errored</span> : c.end}
          {c.endReason && <span className="text-muted-foreground">: {c.endReason}</span>}, after {c.turns} {c.turns === 1 ? "turn" : "turns"}
        </dd>
        {c.error && (
          <>
            <dt className="text-muted-foreground">Error</dt>
            <dd className="whitespace-pre-wrap text-fail">{c.error}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Flags</dt>
        <dd>
          <Flags c={c} statusClass={STATUS_CLASS[status]} />
        </dd>
        <dt className="text-muted-foreground">Claims</dt>
        <dd>
          <Claims c={c} />
        </dd>
        <dt className="text-muted-foreground">Cost</dt>
        <dd className="font-mono">
          agent {c.calls} {c.calls === 1 ? "call" : "calls"}, {formatCount(countedTokens(c.usage))} counted · customer {c.customerCalls}{" "}
          {c.customerCalls === 1 ? "call" : "calls"}, {formatCount(countedTokens(c.customerUsage))} counted · ${c.costUsd.toFixed(4)}
        </dd>
      </dl>

      {c.sampled && c.status === "finished" && <VerdictSummary verdicts={c.verdicts} errored={false} />}

      <TrajectorySteps trial={conversationTrial(c)} />
    </>
  );
}

function Flags({ c, statusClass }: { c: Conversation; statusClass: string }) {
  if (!c.sampled) return <span className="text-muted-foreground">Not graded: this conversation wasn&apos;t in the batch&apos;s sample.</span>;
  if (c.status === "errored") return <span className="text-muted-foreground">Not graded: it errored before it finished.</span>;
  if (c.flags.length === 0) return <span className={statusClass}>None</span>;
  return (
    <ul>
      {c.flags.map((f) => (
        <li key={f} className={statusClass}>
          {f}
        </li>
      ))}
    </ul>
  );
}

function Claims({ c }: { c: Conversation }) {
  if (!c.sampled || c.status === "errored") return <span className="text-muted-foreground">Not checked: only graded conversations are.</span>;
  if (c.claims === null) return <span className="text-muted-foreground">Not checked: the claim checker stopped before it got here.</span>;
  if (c.claims.status === "ungraded") {
    return (
      <span>
        <span className="text-fail">? couldn&apos;t grade</span> <span className="text-muted-foreground">{c.claims.reason}</span>
      </span>
    );
  }
  const bad = c.claims.claims.filter((x) => x.label !== "supported").length;
  return (
    <span>
      {c.claims.claims.length} {c.claims.claims.length === 1 ? "claim" : "claims"},{" "}
      <span className={bad > 0 ? "text-fail" : "text-pass"}>{bad} not supported</span>{" "}
      <span className="text-muted-foreground">(each shown under its reply)</span>
    </span>
  );
}
