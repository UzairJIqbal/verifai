import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { EmptyState, PageHeading } from "@/components/shell/empty-state";
import { LoadError } from "@/components/runs/load-error";
import { Labeller, type Offered } from "@/components/labelling/labeller";
import { loadPolicy } from "@/src/agent/versions";
import { loadConfig } from "@/src/config";
import { loadRubric, rubricSection } from "@/src/judge/rubric";
import { readLabels } from "@/src/labels/files";
import { labellingPool, nextToLabel, type Pool } from "@/src/labels/pick";
import { trialKey, type Label } from "@/src/labels/schema";
import { isLocalOnlyEnabled } from "@/src/local";
import { JUDGE_CRITERION_TEXT } from "@/src/results/judge-text";
import { getShopToday, SEED_DB_PATH } from "@/src/shop/db";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Labelling" };

export default function LabellingPage() {
  // Deployed, the page doesn't exist: it writes into the repository.
  if (!isLocalOnlyEnabled()) notFound();
  return (
    <Suspense fallback={<p className="text-muted-foreground">Finding the next trial to label…</p>}>
      <LiveLabelling />
    </Suspense>
  );
}

type Loaded =
  | { ok: true; labels: Label[]; pool: Pool; offered: Offered | null; rubricVersion: string; policy: string; today: string }
  | { ok: false; error: string };

function load(): Loaded {
  try {
    const rubric = loadRubric(loadConfig().judge.rubricVersion);
    const labels = readLabels();
    const pool = labellingPool(rubric.version);
    const next = nextToLabel(pool, labels);
    if (!existsSync(SEED_DB_PATH)) return { ok: false, error: "The shop hasn't been seeded yet. Run `pnpm seed`, then reload this page." };
    const seed = new DatabaseSync(SEED_DB_PATH, { readOnly: true });
    let today: string;
    try {
      today = getShopToday(seed);
    } finally {
      seed.close();
    }
    // Only what you need to label: the conversation, the criteria asked and
    // the claims' words. The judges' answers never leave the server until
    // the label is saved.
    let offered: Offered | null = null;
    if (next && next.trial.judge?.status === "judged" && next.trial.claims?.status === "checked") {
      offered = {
        runId: next.runId,
        taskId: next.taskId,
        tryNumber: next.tryNumber,
        steps: next.trial.steps,
        criteria: next.trial.judge.verdicts.map((v) => ({ criterion: v.criterion, ...JUDGE_CRITERION_TEXT[v.criterion], rubric: rubricSection(rubric.text, v.criterion) })),
        claims: next.trial.claims.claims.map((c) => ({ step: c.step, text: c.text })),
      };
    }
    return { ok: true, labels, pool, offered, rubricVersion: rubric.version, policy: loadPolicy(), today };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// Read at request time: a label saved, or a run judged, shows on reload.
async function LiveLabelling() {
  await connection();
  const loaded = load();
  if (!loaded.ok) {
    return (
      <>
        <PageHeading title="Labelling" />
        <LoadError title="The labelling page can't start." message={loaded.error} />
      </>
    );
  }
  const { labels, pool, offered } = loaded;
  const dev = labels.filter((l) => l.split === "judge-dev").length;
  const left = pool.trials.length - pool.trials.filter((t) => labels.some((l) => trialKey(l) === trialKey(t))).length;

  return (
    <>
      <PageHeading title="Labelling">
        Mark each criterion and claim yourself, then save. The judges&apos; answers are shown only after saving, and only for judge-dev trials. Trials come in a fixed random order from dev
        runs; there&apos;s no skipping.
      </PageHeading>
      <p className="mb-3 text-[12px] text-muted-foreground">
        <span className="text-foreground">{labels.length} labelled</span> · judge-dev {dev} · judge-test {labels.length - dev} · {left} left to label · rubric{" "}
        <span className="font-mono">{loaded.rubricVersion}</span>
        {labels.length > 0 && (
          <>
            {" "}
            · <code>pnpm agreement</code> prints the report
          </>
        )}
      </p>
      {pool.problems.map((p) => (
        <p key={p} className="mb-2 text-[12px] whitespace-pre-wrap text-fail">
          {p}
        </p>
      ))}
      {pool.waiting.length > 0 && (
        <details className="mb-3 text-[12px] text-muted-foreground">
          <summary className="cursor-pointer">{pool.waiting.length} dev runs aren&apos;t ready to label</summary>
          <ul className="mt-1 space-y-0.5">
            {pool.waiting.map((w) => (
              <li key={w.runId}>
                <span className="font-mono">{w.runId}</span>: {w.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
      {offered === null ? (
        pool.trials.length === 0 ? (
          <EmptyState title="Nothing to label yet.">
            Trials need a finished dev run read by both judges with rubric {loaded.rubricVersion}. Run <code>pnpm eval</code>, then <code>pnpm claims &lt;run&gt;</code> and{" "}
            <code>pnpm judge &lt;run&gt;</code>.
          </EmptyState>
        ) : (
          <EmptyState title="Every judged trial is labelled.">
            Run <code>pnpm agreement</code> for the report. To label more, judge another dev run with <code>pnpm claims &lt;run&gt;</code> and <code>pnpm judge &lt;run&gt;</code>.
          </EmptyState>
        )
      ) : (
        <>
          <details className="mb-3 max-w-[56rem] text-[12px]">
            <summary className="cursor-pointer text-muted-foreground">The policy and date the agent had (today: {loaded.today})</summary>
            <pre className="mt-1 max-h-80 overflow-auto rounded-md border p-3 font-sans whitespace-pre-wrap">{loaded.policy}</pre>
          </details>
          {/* Keyed by trial, so the next one starts with nothing marked. */}
          <Labeller key={trialKey(offered)} offered={offered} />
        </>
      )}
    </>
  );
}
