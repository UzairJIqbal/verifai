import Link from "next/link";
import { EmptyState } from "@/components/shell/empty-state";

export default function NotFound() {
  return (
    <EmptyState title="There's no page here.">
      Pick a place from the navigation above, or go to the <Link href="/runs">runs</Link>.
    </EmptyState>
  );
}
