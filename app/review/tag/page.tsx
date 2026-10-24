import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { EmptyState, PageHeading } from "@/components/shell/empty-state";
import { LoadError } from "@/components/runs/load-error";
import { TagRow } from "@/components/review/tag-row";
import { isLocalOnlyEnabled } from "@/src/local";
import { trialPath } from "@/src/review/doc";
import { readNotes, readTags, readTaxonomy, REVIEW_FILES, shown } from "@/src/review/files";
import { latestTags, taxonomyReport, type TaxonomyReport } from "@/src/review/report";
import { trialKey, type Taxonomy } from "@/src/review/schema";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Tag notes" };

export default function TagPage() {
  // Deployed, the page doesn't exist: it writes into the repository.
  if (!isLocalOnlyEnabled()) notFound();
  return (
    <Suspense fallback={<p className="text-muted-foreground">Reading your notes…</p>}>
      <LiveTagging />
    </Suspense>
  );
}

type Loaded = { ok: true; taxonomy: Taxonomy | null; report: TaxonomyReport | null; stale: Map<string, string> } | { ok: false; error: string };

function load(): Loaded {
  try {
    const notes = readNotes();
    const tags = readTags(notes);
    const taxonomy = readTaxonomy();
    if (taxonomy === null) return { ok: true, taxonomy, report: null, stale: new Map() };
    // A note whose newest tag names a category that's gone: shown with the old name.
    const stale = new Map([...latestTags(tags)].map(([key, t]) => [key, t.category]));
    return { ok: true, taxonomy, report: taxonomyReport(notes, tags, taxonomy), stale };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function LiveTagging() {
  await connection();
  const loaded = load();
  const back = (
    <p className="mb-1 text-[12px]">
      <Link href="/review" className="text-link hover:underline">
        Review
      </Link>
    </p>
  );
  if (!loaded.ok) {
    return (
      <>
        {back}
        <PageHeading title="Tag notes" />
        <LoadError title="Your notes can't be read." message={loaded.error} />
      </>
    );
  }
  const { taxonomy, report } = loaded;
  if (taxonomy === null || report === null) {
    return (
      <>
        {back}
        <PageHeading title="Tag notes" />
        <EmptyState title="No taxonomy yet.">
          Write about 50 notes on the review page first, then group them into 5 to 10 categories in <code>{shown(REVIEW_FILES.taxonomy)}</code>. The review page shows the format.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      {back}
      <PageHeading title="Tag notes">
        Give each note written before the taxonomy exactly one category. If two fit, pick the one that happened first in the trajectory.
      </PageHeading>
      {report.untagged.length === 0 ? (
        <EmptyState title="Every note has a category.">
          Run <code>pnpm taxonomy</code> to write the report, then see it on the{" "}
          <Link href="/failures" className="text-link hover:underline">
            failures page
          </Link>
          .
        </EmptyState>
      ) : (
        <>
          <p className="mb-2 text-[12px] text-muted-foreground">
            <span className="text-foreground">{report.untagged.length} to tag</span> of {report.notes} notes
          </p>
          <details className="mb-3 max-w-[56rem] text-[12px]">
            <summary className="cursor-pointer text-muted-foreground">The {taxonomy.categories.length} categories</summary>
            <dl className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-[12rem_minmax(0,1fr)]">
              {taxonomy.categories.map((c) => (
                <div key={c.id} className="contents">
                  <dt className="font-medium">{c.name}</dt>
                  <dd className="text-muted-foreground">{c.definition}</dd>
                </div>
              ))}
            </dl>
          </details>
          <ul className="max-w-[56rem] divide-y rounded-md border text-[12px]">
            {report.untagged.map((n) => {
              const gone = loaded.stale.get(trialKey(n));
              return (
                <li key={trialKey(n)} className="space-y-1.5 px-3 py-2">
                  <p>
                    <Link href={trialPath(n)} className="font-mono text-link hover:underline">
                      {n.taskId}
                    </Link>
                    <span className="text-muted-foreground">
                      , try {n.tryNumber} · <span className="font-mono">{n.runId}</span>
                    </span>
                    {gone && <span className="text-noise"> · was tagged {gone}, which the taxonomy no longer has</span>}
                  </p>
                  <p className="whitespace-pre-wrap">{n.note}</p>
                  <TagRow trial={{ runId: n.runId, taskId: n.taskId, tryNumber: n.tryNumber }} categories={taxonomy.categories} />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
