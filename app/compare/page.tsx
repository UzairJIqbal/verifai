import { EmptyState, PageHeading } from "@/components/shell/empty-state";

export default function ComparePage() {
  return (
    <>
      <PageHeading title="Compare" />
      <EmptyState title="Nothing to compare yet.">
        Phase 5 adds the statistics: error bars, the noise floor, and this page for putting two runs side by side.
      </EmptyState>
    </>
  );
}
