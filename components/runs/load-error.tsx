// A results file that can't be read: what's wrong and how to get it back.
export function LoadError({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-lg border border-fail/40 px-5 py-6">
      <p className="font-medium text-fail">{title}</p>
      <p className="mt-1 max-w-prose whitespace-pre-wrap text-muted-foreground">{message}</p>
      <p className="mt-2 max-w-prose text-muted-foreground">
        The files under <code>results/</code> are written by <code>pnpm eval</code> when a run finishes. If one was edited by hand, restore it
        from git or run the eval again.
      </p>
    </div>
  );
}
