import type { ReactNode } from "react";

// Every page's "nothing here yet": what's missing, and what fills it.
export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed px-5 py-8">
      <p className="font-medium">{title}</p>
      <div className="mt-1 max-w-prose text-muted-foreground">{children}</div>
    </div>
  );
}

export function PageHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-4">
      <h1 className="text-base font-semibold">{title}</h1>
      {children && <p className="max-w-prose text-muted-foreground">{children}</p>}
    </div>
  );
}
