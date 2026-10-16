import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/shell/empty-state";
import { countedTokens, formatCount, formatPercent, formatWhen } from "@/components/runs/format";
import { HoldoutLock } from "@/components/runs/holdout-lock";
import { LoadError } from "@/components/runs/load-error";
import { RunStatsReport } from "@/components/runs/run-stats";
import { TrialTable, type TrialRow } from "@/components/runs/trial-table";
import { GraderReportSection } from "@/components/runs/grader-report";
import { OUTCOME_GRADERS } from "@/src/graders";
import { readRun, type RunFiles } from "@/src/results/read";
import { trialTags } from "@/src/stats/graders";

const isOutcome = (grader: string) => OUTCOME_GRADERS.some((g) => g === grader);

// The run id is only known per request, so it's read inside Suspense.
export default function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading the run…</p>}>
      {params.then(({ runId }) => (
        <Run runId={runId} />
      ))}
    </Suspense>
  );
}

function Run({ runId }: { runId: string }) {
  let files: RunFiles | null;
  try {
    files = readRun(runId);
  } catch (error) {
    return (
      <>
        <PageHeading title={`Run ${runId}`} />
        <LoadError title="This run can't be read." message={error instanceof Error ? error.message : String(error)} />
      </>
    );
  }
  if (files === null) notFound();

  const { report: r } = files;
  const t = r.totals;
  const rows: TrialRow[] =
    files.split === "holdout"
      ? files.trials.map((x) => ({ taskId: x.taskId, tryNumber: x.tryNumber, category: x.category, difficulty: x.difficulty, status: x.status, why: null, flags: [], tags: [], detail: null }))
      : files.trials.map((x) => ({
          taskId: x.taskId,
          tryNumber: x.tryNumber,
          category: x.category,
          difficulty: x.difficulty,
          status: x.status,
          why:
            x.status === "errored"
              ? x.error
              : x.verdicts
                  .filter((v) => isOutcome(v.grader) && !v.pass)
                  .map((v) => `${v.grader}: ${v.reason}`)
                  .join(" · ") || null,
          flags: x.verdicts.filter((v) => !isOutcome(v.grader) && !v.pass).map((v) => (v.ungraded ? `${v.grader} (couldn't grade)` : v.grader)),
          tags: [...trialTags(x)],
          detail: { calls: x.calls, replayed: x.cachedCalls, tokens: countedTokens(x.usage), modelMs: x.modelLatencyMs, end: x.end },
        }));

  return (
    <>
      <p className="mb-1 text-[12px]">
        <Link href="/runs" className="text-link hover:underline">
          Runs
        </Link>
      </p>
      <PageHeading title={`${r.smoke ? "Smoke run" : "Run"} ${r.runId}`} />

      <dl className="mb-4 grid max-w-[64rem] gap-x-6 gap-y-1 text-[12px] sm:grid-cols-[8rem_minmax(0,1fr)]">
        {r.smoke ? (
          <>
            <dt className="text-muted-foreground">Smoke run</dt>
            <dd>
              <span className="font-mono">
                {t.passed}/{t.trials} tries passed
              </span>
              <span className="text-muted-foreground">
                {" "}
                from {r.taskCount} tasks, one per category, × {r.triesPerTask} tries; {t.failed} failed, {t.errored} errored. It checks that
                the machinery works and is never a score, a comparison or a gate.
              </span>
            </dd>
          </>
        ) : (
          <>
            <dt className="text-muted-foreground">Tries</dt>
            <dd>
              <span className="font-mono">
                {t.passed}/{t.trials} passed ({formatPercent(t.passed, t.trials)})
              </span>
              <span className="text-muted-foreground">
                {" "}
                from {r.taskCount} tasks × {r.triesPerTask} tries; {t.failed} failed, {t.errored} errored.
              </span>
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">Agent</dt>
        <dd>
          <span className="font-mono">
            {r.agent.model}
          </span>{" "}
          from <span className="font-mono">{r.agent.pool.join(", then ")}</span>
          , temperature {r.agent.temperature}, reasoning {r.agent.reasoningEffort}, at most {r.agent.maxSteps} steps, prompt <span className="font-mono">{r.agent.promptVersion}</span>, tools{" "}
          <span className="font-mono">{r.agent.toolDescriptionsVersion}</span>
        </dd>
        <dt className="text-muted-foreground">Tasks</dt>
        <dd>
          {r.split} split{r.smoke ? " (smoke: a fixed task from each category)" : ""}, dataset <span className="font-mono">{r.datasetVersion}</span>
        </dd>
        <dt className="text-muted-foreground">Model calls</dt>
        <dd>
          <span className="font-mono">{formatCount(t.calls)}</span>, {formatCount(t.cachedCalls)} replayed from the cache (cache{" "}
          {r.useCache ? "on" : "off"}),{" "}
          {Object.entries(t.callsByProvider)
            .map(([provider, calls]) => `${formatCount(calls)} from ${provider}`)
            .join(", ") || "none answered"} · <span className="font-mono">{formatCount(countedTokens(t.usage))}</span> tokens counted · $
          {t.costUsd.toFixed(4)} at list price
        </dd>
        <dt className="text-muted-foreground">Configuration</dt>
        <dd>
          <span className="font-mono">{r.configKey}</span>
          <span className="text-muted-foreground"> · runs with the same key share a noise floor</span>
        </dd>
        <dt className="text-muted-foreground">Ran</dt>
        <dd>
          {formatWhen(r.createdAt)} to {formatWhen(r.finishedAt)}
        </dd>
      </dl>

      {r.stats && <RunStatsReport runId={r.runId} stats={r.stats} />}
      {r.stats && t.errored > 0 && (
        <p className="mb-4 text-[12px] text-fail">
          {t.errored} tries errored. They count as not passed, so these rates understate the agent.
        </p>
      )}

      {r.graders && <GraderReportSection runId={r.runId} g={r.graders} linked={files.split !== "holdout"} />}

      {files.split === "holdout" && (
        <div className="mb-4">
          <HoldoutLock />
        </div>
      )}
      <TrialTable runId={r.runId} rows={rows} sealed={files.split === "holdout"} />
    </>
  );
}
