import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/shell/empty-state";
import { formatMs, TranscriptRow } from "@/components/playground/transcript";
import { countedTokens, formatCount, STATUS_CLASS } from "@/components/runs/format";
import { ClaimNote, ClaimsLine } from "@/components/runs/claims";
import { JudgeVerdicts } from "@/components/runs/judge-verdicts";
import { HoldoutLock } from "@/components/runs/holdout-lock";
import { LoadError } from "@/components/runs/load-error";
import { stepsToItems, verdictsByItem } from "@/components/runs/trajectory";
import { VerdictNote, VerdictSummary } from "@/components/runs/verdicts";
import { readRun, type RunFiles } from "@/src/results/read";
import type { Claim } from "@/src/results/schema";

type Params = { runId: string; taskId: string; tryNumber: string };

export default function TrajectoryPage({ params }: { params: Promise<Params> }) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading the trajectory…</p>}>
      {params.then((p) => (
        <Trajectory {...p} />
      ))}
    </Suspense>
  );
}

function Trajectory({ runId, taskId, tryNumber }: Params) {
  let files: RunFiles | null;
  try {
    files = readRun(runId);
  } catch (error) {
    return (
      <>
        <PageHeading title={`${taskId}, try ${tryNumber}`} />
        <LoadError title="This run can't be read." message={error instanceof Error ? error.message : String(error)} />
      </>
    );
  }
  if (files === null) notFound();

  const back = (
    <p className="mb-1 text-[12px]">
      <Link href="/runs" className="text-link hover:underline">
        Runs
      </Link>
      <span className="text-muted-foreground"> / </span>
      <Link href={`/runs/${runId}`} className="font-mono text-link hover:underline">
        {runId}
      </Link>
    </p>
  );

  if (files.split === "holdout") {
    return (
      <>
        {back}
        <PageHeading title={`${taskId}, try ${tryNumber}`} />
        <HoldoutLock />
      </>
    );
  }

  const trial = files.trials.find((t) => t.taskId === taskId && String(t.tryNumber) === tryNumber);
  if (!trial) notFound();
  const items = stepsToItems(trial.steps);
  const byItem = verdictsByItem(items, trial.verdicts);
  // Fabricated values by the step they were written in; a tool call's step is its row.
  const spansAt = new Map<string, string[]>();
  for (const v of trial.verdicts) for (const s of v.spans) spansAt.set(String(s.step), [...(spansAt.get(String(s.step)) ?? []), s.text]);
  const claimsAt = new Map<string, Claim[]>();
  if (trial.claims?.status === "checked") for (const c of trial.claims.claims) claimsAt.set(String(c.step), [...(claimsAt.get(String(c.step)) ?? []), c]);

  return (
    <>
      {back}
      <PageHeading title={`${trial.taskId}, try ${trial.tryNumber}`} />

      <dl className="mb-4 grid max-w-[64rem] gap-x-6 gap-y-1 text-[12px] sm:grid-cols-[8rem_minmax(0,1fr)]">
        <dt className="text-muted-foreground">Outcome</dt>
        <dd>
          <span className={`font-medium ${STATUS_CLASS[trial.status]}`}>{trial.status}</span>
          {trial.end && <span className="text-muted-foreground">, the conversation ended: {trial.end}</span>}
        </dd>
        {trial.error && (
          <>
            <dt className="text-muted-foreground">Error</dt>
            <dd className="whitespace-pre-wrap text-fail">{trial.error}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Cost</dt>
        <dd className="font-mono">
          {trial.calls} {trial.calls === 1 ? "call" : "calls"}{trial.cachedCalls > 0 && ` (${trial.cachedCalls} replayed)`} · {formatCount(trial.usage.inputTokens)} in
          {trial.usage.cachedInputTokens > 0 && ` (${formatCount(trial.usage.cachedInputTokens)} cached)`} ·{" "}
          {formatCount(trial.usage.outputTokens)} out · {formatCount(countedTokens(trial.usage))} counted · {formatMs(trial.modelLatencyMs)} waiting on the
          model · ${trial.costUsd.toFixed(4)}
        </dd>
        <dt className="text-muted-foreground">Claims</dt>
        <dd>
          <ClaimsLine claims={trial.claims} runId={runId} errored={trial.status === "errored"} />
        </dd>
        <dt className="text-muted-foreground">Trace</dt>
        <dd>
          {trial.traceUrl ? (
            <a href={trial.traceUrl} target="_blank" rel="noreferrer" className="text-link hover:underline">
              Open in Langfuse
            </a>
          ) : (
            <span className="text-muted-foreground">None: tracing was off when this try ran. Add the Langfuse keys to .env.local to trace the next run.</span>
          )}
        </dd>
      </dl>

      <VerdictSummary verdicts={trial.verdicts} errored={trial.status === "errored"} />
      <JudgeVerdicts judge={trial.judge} runId={runId} errored={trial.status === "errored"} hasReply={trial.steps.some((s) => s.type === "text")} />

      {items.length === 0 ? (
        <p className="text-muted-foreground">No steps were recorded: the try failed before its first model call.</p>
      ) : (
        <ol className="max-w-[56rem] divide-y rounded-md border px-3">
          {items.map((item) => (
            <TranscriptRow
              key={item.id}
              item={item}
              still
              marks={{
                at: Number(item.id),
                failing: (byItem.get(item.id) ?? []).some((v) => !v.pass),
                highlight: spansAt.get(item.id),
                notes: (
                  <>
                    {(byItem.get(item.id) ?? []).map((v) => (
                      <VerdictNote key={v.grader} v={v} />
                    ))}
                    {(claimsAt.get(item.id) ?? []).map((c, i) => (
                      <ClaimNote key={i} c={c} />
                    ))}
                  </>
                ),
              }}
            />
          ))}
        </ol>
      )}
    </>
  );
}
