// `pnpm taxonomy`: counts your tagged failure notes by category, prints each
// one's share with its interval and which to fix first, then rewrites
// docs/failure-taxonomy.md. Sends no model calls.
import { writeFileSync } from "node:fs";
import { styleText } from "node:util";
import { dim, fatal } from "../src/eval/session";
import { draftedLine, shareText, taxonomyDoc, trialPath, verdictLine } from "../src/review/doc";
import { readNotes, readTags, readTaxonomy, REVIEW_FILES, shown, TAXONOMY_DOC } from "../src/review/files";
import { taxonomyReport } from "../src/review/report";

function main(): void {
  try {
    const notes = readNotes();
    if (notes.length === 0) fatal("No failure notes yet. Start `pnpm dev` and open /review to write some.");
    const taxonomy = readTaxonomy();
    if (taxonomy === null) fatal(`${notes.length} notes, but no taxonomy yet. After about 50 notes, write ${shown(REVIEW_FILES.taxonomy)}: /review shows the format.`);
    const report = taxonomyReport(notes, readTags(notes), taxonomy);

    console.log(styleText("bold", `VerifAI failure taxonomy · ${report.notes} failed dev tries from ${report.tasks} tasks · ${report.tagged} tagged`));
    console.log(dim("  Share is of every tagged failure, with a 95% interval from the bootstrap (resampling whole tasks, fixed seed)."));
    const drafted = draftedLine(report);
    if (drafted !== null) console.log(styleText("yellow", `  ${drafted}`));
    if (report.untagged.length > 0) console.log(styleText("yellow", `  ${report.untagged.length} notes have no category and are counted nowhere. Tag them at /review/tag.`));

    const rows = [["", "failures", "tasks", "share"], ...report.rows.map((r) => [`${r.name}${r.agentFailure ? "" : " (not an agent failure)"}`, `${r.count}`, `${r.tasks}`, shareText(r.share)])];
    const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
    rows.forEach((r, i) => {
      const line = `    ${r.map((c, j) => (j === 0 ? c.padEnd(widths[j]) : c.padStart(widths[j]))).join("  ")}`;
      console.log(i === 0 ? dim(line) : line);
    });
    for (const r of report.rows.filter((x) => x.examples.length > 0)) console.log(dim(`    ${r.name}: ${r.examples.map(trialPath).join("  ")}`));
    console.log(`\n  ${verdictLine(report).replace(/\*\*/g, "")}`);

    writeFileSync(TAXONOMY_DOC, taxonomyDoc({ report, taxonomy }));
    console.log(dim(`\n  Wrote ${shown(TAXONOMY_DOC)}.`));
  } catch (error) {
    fatal(error instanceof Error ? error.message : String(error));
  }
}

main();
