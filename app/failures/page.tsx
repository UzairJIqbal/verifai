import Link from "next/link";
import { EmptyState, PageHeading } from "@/components/shell/empty-state";
import { isLocalOnlyEnabled } from "@/src/local";
import { draftedLine, shareText, taxonomyDoc, trialPath } from "@/src/review/doc";
import { readNotes, readTags, readTaxonomy, readTaxonomyDoc, REVIEW_FILES, shown, TAXONOMY_DOC } from "@/src/review/files";
import { taxonomyReport, type TaxonomyReport } from "@/src/review/report";
import { trialKey, type Taxonomy } from "@/src/review/schema";

type Loaded = { ok: true; notes: number; taxonomy: Taxonomy | null; report: TaxonomyReport | null; docMatches: boolean } | { ok: false; error: string };

function load(): Loaded {
  try {
    const notes = readNotes();
    const taxonomy = readTaxonomy();
    if (taxonomy === null) return { ok: true, notes: notes.length, taxonomy, report: null, docMatches: true };
    const report = taxonomyReport(notes, readTags(notes), taxonomy);
    // The doc is written by `pnpm taxonomy`; this says when it's behind.
    return { ok: true, notes: notes.length, taxonomy, report, docMatches: readTaxonomyDoc() === taxonomyDoc({ report, taxonomy }) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// Read from the committed files under evals/review/, so this page is the same here and deployed.
export default function FailuresPage() {
  const loaded = load();
  const heading = (
    <PageHeading title="Failures">
      Why failed dev tries failed, in categories named after reading them. Each note was written in free text first, then given exactly one category. Share is of every tagged failure,
      with its 95% interval in brackets, resampled by task.
    </PageHeading>
  );
  if (!loaded.ok) {
    return (
      <>
        {heading}
        <div className="rounded-lg border border-fail/40 px-5 py-6">
          <p className="font-medium text-fail">The review files can&apos;t be read.</p>
          <p className="mt-1 max-w-prose whitespace-pre-wrap text-muted-foreground">{loaded.error}</p>
          <p className="mt-2 max-w-prose text-muted-foreground">
            They&apos;re under <code>evals/review/</code>. If one was edited by hand, fix the line named above or restore it from git.
          </p>
        </div>
      </>
    );
  }
  const local = isLocalOnlyEnabled();
  const { report, taxonomy } = loaded;
  if (loaded.notes === 0) {
    return (
      <>
        {heading}
        <EmptyState title="No failures reviewed yet.">
          {local ? (
            <>
              Open the{" "}
              <Link href="/review" className="text-link hover:underline">
                review queue
              </Link>{" "}
              and write a note for each failed dev try.
            </>
          ) : (
            <>
              Notes are written on your own machine: run <code>pnpm dev</code> and open the review queue.
            </>
          )}
        </EmptyState>
      </>
    );
  }
  if (taxonomy === null || report === null) {
    return (
      <>
        {heading}
        <EmptyState title={`${loaded.notes} notes, no taxonomy yet.`}>
          After about 50 notes, group them into 5 to 10 categories in <code>{shown(REVIEW_FILES.taxonomy)}</code>
          {local && (
            <>
              ; the{" "}
              <Link href="/review" className="text-link hover:underline">
                review queue
              </Link>{" "}
              shows the format
            </>
          )}
          .
        </EmptyState>
      </>
    );
  }

  const top = report.top;
  const cell = "px-3 py-1.5 align-top";
  return (
    <>
      {heading}
      <p className="mb-2 text-[12px] text-muted-foreground">
        <span className="text-foreground">{report.notes} failed dev tries</span> from {report.tasks} tasks · {report.tagged} tagged · taxonomy written {taxonomy.writtenAt}
      </p>
      {draftedLine(report) !== null && <p className="mb-2 text-[12px] text-muted-foreground">{draftedLine(report)}</p>}
      {report.untagged.length > 0 && (
        <p className="mb-2 text-[12px] text-fail">
          {report.untagged.length} notes have no category yet and are counted nowhere.
          {local && (
            <>
              {" "}
              Tag them on the{" "}
              <Link href="/review/tag" className="text-link hover:underline">
                tagging page
              </Link>
              .
            </>
          )}
        </p>
      )}
      {!loaded.docMatches && (
        <p className="mb-2 text-[12px] text-noise">
          <code>{shown(TAXONOMY_DOC)}</code> doesn&apos;t match this page. Run <code>pnpm taxonomy</code> to rewrite it.
        </p>
      )}

      <p className="mb-3 max-w-prose">
        {top === null ? (
          "No agent failure is tagged yet, so there's nothing to fix first."
        ) : (
          <>
            Fix first: <span className="font-semibold">{top.row.name}</span>, {top.row.count} of {report.tagged} tagged failures, {shareText(top.row.share)}.{" "}
            {top.next === null ? (
              "No other agent-failure category has a tagged note."
            ) : top.clear ? (
              <>
                Its interval is clear of the next one, {top.next.name} ({shareText(top.next.share)}).
              </>
            ) : (
              <span className="text-noise">
                Its interval overlaps the next one, {top.next.name} ({shareText(top.next.share)}), so the order between the two is within the noise; it&apos;s first by count.
              </span>
            )}
          </>
        )}
      </p>

      <div className="max-w-[72rem] overflow-x-auto rounded-md border">
        <table className="w-full text-[12px]">
          <thead className="border-b text-left text-muted-foreground">
            <tr>
              <th className={`${cell} font-normal`}>Category</th>
              <th className={`${cell} text-right font-normal`}>Failures</th>
              <th className={`${cell} text-right font-normal`}>Tasks</th>
              <th className={`${cell} font-normal whitespace-nowrap`}>Share (95%)</th>
              <th className={`${cell} font-normal`}>Two examples</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {report.rows.map((r) => (
              <tr key={r.id}>
                <td className={cell}>
                  <p className="font-medium">
                    {r.name}
                    {!r.agentFailure && <span className="font-normal text-muted-foreground"> (not an agent failure)</span>}
                  </p>
                  <p className="text-muted-foreground">{r.definition}</p>
                </td>
                <td className={`${cell} text-right font-mono`}>{r.count}</td>
                <td className={`${cell} text-right font-mono`}>{r.tasks}</td>
                <td className={`${cell} font-mono whitespace-nowrap`}>{shareText(r.share)}</td>
                <td className={cell}>
                  {r.examples.length === 0 ? (
                    <span className="text-muted-foreground">No tagged notes.</span>
                  ) : (
                    <ul className="space-y-1">
                      {r.examples.map((n) => (
                        <li key={trialKey(n)}>
                          <Link href={trialPath(n)} className="font-mono text-link hover:underline">
                            {n.taskId}, try {n.tryNumber}
                          </Link>
                          <span className="text-muted-foreground"> · {n.note}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
