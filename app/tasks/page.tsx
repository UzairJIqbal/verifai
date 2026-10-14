import { EmptyState, PageHeading } from "@/components/shell/empty-state";
import { TaskTable, type TaskRow } from "@/components/tasks/task-table";
import { describeExpected } from "@/src/graders/state";
import { describeFact } from "@/src/graders/reply";
import { isLocalOnlyEnabled } from "@/src/local";
import { loadTasks, type LoadedTasks } from "@/src/tasks/load";
import { CATEGORIES } from "@/src/tasks/schema";

type Loaded = { ok: true; data: LoadedTasks } | { ok: false; error: string };

function load(): Loaded {
  try {
    return { ok: true, data: loadTasks() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// Read through the loader, like everything else, so only dev tasks reach this
// page. The holdout is a count per category and nothing more.
export default function TasksPage() {
  const loaded = load();
  if (!loaded.ok) {
    return (
      <>
        <PageHeading title="Tasks" />
        <div className="rounded-lg border border-fail/40 px-5 py-6">
          <p className="font-medium text-fail">The tasks can&apos;t be loaded.</p>
          <p className="mt-1 max-w-prose whitespace-pre-wrap text-muted-foreground">{loaded.error}</p>
        </div>
      </>
    );
  }

  const { version, tasks, holdoutCounts } = loaded.data;
  const holdoutTotal = CATEGORIES.reduce((sum, c) => sum + holdoutCounts[c], 0);
  const rows: TaskRow[] = tasks.map((t) => ({
    id: t.id,
    category: t.category,
    difficulty: t.difficulty,
    adversarial: t.adversarial,
    note: t.note,
    firstMessage: t.first_message,
    cannedReplies: t.canned_replies,
    changes: t.expected.changes.map(describeExpected),
    facts: t.expected.facts.map(describeFact),
    refusal: t.expected.refusal,
  }));

  return (
    <>
      <PageHeading title="Tasks">
        Dataset <span className="font-mono">{version}</span>: {tasks.length} dev tasks, which <code>pnpm eval</code> runs,
        and {holdoutTotal} holdout tasks kept back for the release gate.
      </PageHeading>

      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px]">
        <span className="text-muted-foreground">Holdout, not shown</span>
        {CATEGORIES.map((c) => (
          <span key={c}>
            {c} <span className="font-mono">{holdoutCounts[c]}</span>
          </span>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No dev tasks.">
          Add tasks to <code>evals/tasks.jsonl</code> with <code>&quot;split&quot;: &quot;dev&quot;</code>, then reload.
        </EmptyState>
      ) : (
        <TaskTable rows={rows} canOpenPlayground={isLocalOnlyEnabled()} />
      )}
    </>
  );
}
