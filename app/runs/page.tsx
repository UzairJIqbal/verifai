import { EmptyState, PageHeading } from "@/components/shell/empty-state";

export default function RunsPage() {
  return (
    <>
      <PageHeading title="Runs" />
      <EmptyState title="No runs yet.">
        Phase 4 adds the runner: every task tried several times, recorded and saved under <code>results/</code>. Each run
        and its trajectories will be listed here.
      </EmptyState>
    </>
  );
}
