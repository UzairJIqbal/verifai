import { EmptyState, PageHeading } from "@/components/shell/empty-state";

export default function TasksPage() {
  return (
    <>
      <PageHeading title="Tasks" />
      <EmptyState title="No tasks yet.">
        Phase 3 adds the task set, the locked-away holdout and <code>pnpm eval</code>. The tasks will be listed here.
      </EmptyState>
    </>
  );
}
