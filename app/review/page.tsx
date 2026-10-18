import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { EmptyState, PageHeading } from "@/components/shell/empty-state";
import { LoadError } from "@/components/runs/load-error";
import { ClaimsLine } from "@/components/runs/claims";
import { JudgeVerdicts } from "@/components/runs/judge-verdicts";
import { TrajectorySteps } from "@/components/runs/trajectory-steps";
import { VerdictSummary } from "@/components/runs/verdicts";
import { NoteForm } from "@/components/review/note-form";
import { isLocalOnlyEnabled } from "@/src/local";
import { readNotes, readTags, readTaxonomy, REVIEW_FILES, shown } from "@/src/review/files";
import { nextToReview, reviewPool, type Reviewable, type ReviewPool } from "@/src/review/pick";
import { latestTags } from "@/src/review/report";
import { TASK_WRONG, trialKey, type Note, type Taxonomy } from "@/src/review/schema";
import { loadTasks } from "@/src/tasks/load";
import type { Task } from "@/src/tasks/schema";

export default function ReviewPage() {
  if (!isLocalOnlyEnabled()) {
    return (
      <EmptyState title="The review queue only runs on your own machine.">
        It writes your notes into the repository, so it&apos;s turned off on the deployed site. Clone the repository and run <code>pnpm dev</code> to use it.
      </EmptyState>
    );
  }
  return (
    <Suspense fallback={<p className="text-muted-foreground">Finding the next failure to review…</p>}>
      <LiveReview />
    </Suspense>
  );
}

type Loaded =
  | { ok: true; notes: Note[]; untagged: number; taxonomy: Taxonomy | null; pool: ReviewPool; next: Reviewable | null; task: Task | null; tasksVersion: string }
  | { ok: false; error: string };

function load(): Loaded {
  try {
    const notes = readNotes();
    const latest = latestTags(readTags(notes));
    const taxonomy = readTaxonomy();
    const ids = new Set(taxonomy?.categories.map((c) => c.id) ?? []);
    const untagged = taxonomy === null ? 0 : notes.filter((n) => !ids.has(latest.get(trialKey(n))?.category ?? "")).length;
    const pool = reviewPool();
    const next = nextToReview(pool, notes);
    // Dev tasks only: the loader never hands out a holdout task here.
    const loaded = loadTasks();
    const task = next ? (loaded.tasks.find((t) => t.id === next.taskId) ?? null) : null;
    return { ok: true, notes, untagged, taxonomy, pool, next, task, tasksVersion: loaded.version };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// Read at request time: a note saved shows on reload, with the next try.
async function LiveReview() {
  await connection();
  const loaded = load();
  if (!loaded.ok) {
    return (
      <>
        <PageHeading title="Review" />
        <LoadError title="The review queue can't start." message={loaded.error} />
      </>
    );
  }
  const { notes, taxonomy, pool, next, task } = loaded;
  const done = new Set(notes.map(trialKey));
  const left = pool.trials.filter((t) => !done.has(trialKey(t))).length;

  return (
    <>
      <PageHeading title="Review">
        Read each failed dev try and write down what went wrong in your own words. Tries come in a fixed random order; there&apos;s no skipping. Holdout tries are never shown.
      </PageHeading>
      <p className="mb-3 text-[12px] text-muted-foreground">
        <span className="text-foreground">{notes.length} reviewed</span> · {left} failures left
        {taxonomy === null ? (
          " · no taxonomy yet"
        ) : (
          <>
            {" "}
            · {taxonomy.categories.length} categories
            {loaded.untagged > 0 && (
              <>
                {" "}
                ·{" "}
                <Link href="/review/tag" className="text-link hover:underline">
                  {loaded.untagged} notes to tag
                </Link>
              </>
            )}
          </>
        )}
        {notes.length > 0 && (
          <>
            {" "}
            · <code>pnpm taxonomy</code> writes the report
          </>
        )}
      </p>
      {pool.problems.map((p) => (
        <p key={p} className="mb-2 text-[12px] whitespace-pre-wrap text-fail">
          {p}
        </p>
      ))}
      {taxonomy === null && notes.length >= 40 && <TaxonomyHint count={notes.length} />}

      {next === null ? (
        pool.trials.length === 0 ? (
          <EmptyState title="No failed dev tries to review yet.">
            Failures come from finished dev runs that aren&apos;t smoke runs. Run <code>pnpm eval</code>, then reload this page.
          </EmptyState>
        ) : (
          <EmptyState title="Every failed dev try is reviewed.">
            {taxonomy === null ? (
              <>
                Write the taxonomy next: see the note above. To review more, run another dev eval with <code>pnpm eval</code>.
              </>
            ) : (
              <>
                Tag what&apos;s left on the{" "}
                <Link href="/review/tag" className="text-link hover:underline">
                  tagging page
                </Link>
                , then run <code>pnpm taxonomy</code>.
              </>
            )}
          </EmptyState>
        )
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,56rem)_22rem] lg:items-start">
          <div>
            <p className="mb-1 text-[12px] text-muted-foreground">
              <Link href={`/runs/${next.runId}`} className="font-mono text-link hover:underline">
                {next.runId}
              </Link>{" "}
              / <span className="font-mono text-foreground">{next.taskId}</span>, try {next.tryNumber} · {next.trial.category} · {next.trial.difficulty}
              {next.trial.end && <> · ended: {next.trial.end}</>}
            </p>
            <VerdictSummary verdicts={next.trial.verdicts} errored={false} />
            <JudgeVerdicts judge={next.trial.judge} runId={next.runId} errored={false} hasReply={next.trial.steps.some((s) => s.type === "text")} />
            <p className="mb-3 text-[12px]">
              <span className="text-muted-foreground">Claims: </span>
              <ClaimsLine claims={next.trial.claims} runId={next.runId} errored={false} />
            </p>
            <TrajectorySteps trial={next.trial} />
          </div>
          <aside className="space-y-3 lg:sticky lg:top-4">
            <TaskCard task={task} runVersion={next.datasetVersion} tasksVersion={loaded.tasksVersion} />
            {/* Keyed by try, so the next one starts with an empty note. */}
            <NoteForm key={trialKey(next)} trial={{ runId: next.runId, taskId: next.taskId, tryNumber: next.tryNumber }} categories={taxonomy?.categories ?? null} />
          </aside>
        </div>
      )}
    </>
  );
}

// What the task asked for, so a note can say whether the agent or the task was wrong.
function TaskCard({ task, runVersion, tasksVersion }: { task: Task | null; runVersion: string; tasksVersion: string }) {
  if (task === null) return <p className="text-[12px] text-muted-foreground">This task isn&apos;t in the current task file, so what it expected can&apos;t be shown.</p>;
  return (
    <section className="space-y-1 rounded-md border p-3 text-[12px]">
      <p>
        <span className="font-medium">The task:</span> {task.note}
      </p>
      {runVersion !== tasksVersion && (
        <p className="text-noise">
          The run used tasks {runVersion}; this is {tasksVersion}. The task may have changed since.
        </p>
      )}
      <details>
        <summary className="cursor-pointer text-muted-foreground">What it expected</summary>
        <pre className="mt-1 max-h-72 overflow-auto font-mono text-[11px] whitespace-pre-wrap">{JSON.stringify(task.expected, null, 2)}</pre>
      </details>
      <details>
        <summary className="cursor-pointer text-muted-foreground">The reference tool calls</summary>
        <pre className="mt-1 max-h-72 overflow-auto font-mono text-[11px] whitespace-pre-wrap">{JSON.stringify(task.reference, null, 2)}</pre>
      </details>
    </section>
  );
}

function TaxonomyHint({ count }: { count: number }) {
  const example = JSON.stringify(
    {
      writtenAt: "2026-10-20",
      categories: [
        { id: "skipped-lookup", name: "Skipped look-up", definition: "Acted or answered without reading the record first." },
        { id: TASK_WRONG, name: "The task was wrong", definition: "The agent was right; the task's expected result wasn't." },
      ],
    },
    null,
    2,
  );
  return (
    <details className="mb-3 max-w-[56rem] rounded-md border p-3 text-[12px]" open={count >= 50}>
      <summary className="cursor-pointer font-medium">
        {count >= 50 ? "Time to write the taxonomy" : "The taxonomy comes after about 50 notes"} ({count} so far)
      </summary>
      <p className="mt-1 text-muted-foreground">
        Read your notes back and group them into 5 to 10 categories, each with a name and a one-line definition. Save them as <code>{shown(REVIEW_FILES.taxonomy)}</code>. One must
        have the id <code>{TASK_WRONG}</code>, for when the agent was right and the task wasn&apos;t. After that, each new note gets a category as you save it, and the earlier ones
        are tagged on the{" "}
        <Link href="/review/tag" className="text-link hover:underline">
          tagging page
        </Link>
        .
      </p>
      <pre className="mt-2 overflow-auto rounded-md border p-2 font-mono text-[11px]">{example}</pre>
    </details>
  );
}
