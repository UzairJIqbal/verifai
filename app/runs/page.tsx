import Link from "next/link";
import { EmptyState, PageHeading } from "@/components/shell/empty-state";
import { formatPercent, formatWhen } from "@/components/runs/format";
import { listRuns, type RunListing } from "@/src/results/read";

type Loaded = { ok: true; data: RunListing } | { ok: false; error: string };

function load(): Loaded {
  try {
    return { ok: true, data: listRuns() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// Read from results/ alone, so this page is the same here and deployed.
export default function RunsPage() {
  const loaded = load();
  if (!loaded.ok) {
    return (
      <>
        <PageHeading title="Runs" />
        <div className="rounded-lg border border-fail/40 px-5 py-6">
          <p className="font-medium text-fail">The runs can&apos;t be listed.</p>
          <p className="mt-1 max-w-prose whitespace-pre-wrap text-muted-foreground">{loaded.error}</p>
        </div>
      </>
    );
  }
  const { runs, problems } = loaded.data;
  const cell = "px-3 py-1.5 align-top whitespace-nowrap";

  return (
    <>
      <PageHeading title="Runs">
        Every finished run of <code>pnpm eval</code>, newest first. Success is the share of tries that passed, from the number of
        tries shown. No error bar yet, so read small differences as noise. A smoke run only checks the machinery, so it has no success
        rate.
      </PageHeading>

      {problems.length > 0 && (
        <div className="mb-4 rounded-lg border border-fail/40 px-4 py-3">
          <p className="font-medium text-fail">
            {problems.length === 1 ? "One run" : `${problems.length} runs`} couldn&apos;t be read and {problems.length === 1 ? "is" : "are"} left out.
          </p>
          <ul className="mt-1 list-disc pl-4 whitespace-pre-wrap text-muted-foreground">
            {problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {runs.length === 0 ? (
        <EmptyState title="No runs yet.">
          Run <code>pnpm eval</code>. It tries every dev task 4 times and writes the run to <code>results/</code> when it finishes; it then
          shows up here.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-left text-[12px]">
            <thead className="border-b text-muted-foreground">
              <tr>
                <th className={`${cell} font-normal`}>run</th>
                <th className={`${cell} font-normal`}>started</th>
                <th className={`${cell} font-normal`}>split</th>
                <th className={`${cell} font-normal`}>dataset</th>
                <th className={`${cell} font-normal`}>agent</th>
                <th className={`${cell} font-normal`}>tries</th>
                <th className={`${cell} text-right font-normal`}>success</th>
                <th className={`${cell} text-right font-normal`}>errored</th>
                <th className={`${cell} font-normal`}>cache</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.runId} className="border-b last:border-b-0 hover:bg-muted/60">
                  <td className={`${cell} font-mono`}>
                    <Link href={`/runs/${r.runId}`} className="text-link hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                      {r.runId}
                    </Link>
                  </td>
                  <td className={cell}>{formatWhen(r.createdAt)}</td>
                  <td className={cell}>
                    {r.split}
                    {r.smoke && <span className="ml-1.5 rounded border px-1 text-[11px] text-muted-foreground">smoke</span>}
                  </td>
                  <td className={`${cell} font-mono`}>{r.datasetVersion}</td>
                  <td className={cell}>
                    <span className="font-mono">{r.agent.model}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      from <span className="font-mono">{r.agent.pool.join(", ")}</span>, t={r.agent.temperature}, reasoning {r.agent.reasoningEffort}, prompt <span className="font-mono">{r.agent.promptVersion}</span>, tools{" "}
                      <span className="font-mono">{r.agent.toolDescriptionsVersion}</span>
                    </span>
                  </td>
                  <td className={`${cell} font-mono`}>
                    {r.taskCount} × {r.triesPerTask}
                  </td>
                  <td className={`${cell} text-right font-mono`}>
                    {r.smoke ? (
                      <span className="text-muted-foreground">
                        {r.totals.passed}/{r.totals.trials} <span className="font-sans">not a score</span>
                      </span>
                    ) : (
                      <>
                        {r.totals.passed}/{r.totals.trials} <span className="text-muted-foreground">({formatPercent(r.totals.passed, r.totals.trials)})</span>
                      </>
                    )}
                  </td>
                  <td className={`${cell} text-right font-mono ${r.totals.errored > 0 ? "text-fail" : "text-muted-foreground"}`}>{r.totals.errored}</td>
                  <td className={`${cell} text-muted-foreground`}>{r.useCache ? "on" : "off"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
