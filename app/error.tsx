"use client";

import { Button } from "@/components/ui/button";

// Any page that throws lands here instead of a blank screen.
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="rounded-lg border border-fail/40 px-5 py-6">
      <p className="font-medium text-fail">This page hit an error.</p>
      <p className="mt-1 max-w-prose whitespace-pre-wrap text-muted-foreground">{error.message}</p>
      <p className="mt-1 text-muted-foreground">The terminal running <code>pnpm dev</code> has the full details.</p>
      <Button size="sm" variant="outline" className="mt-3" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}
