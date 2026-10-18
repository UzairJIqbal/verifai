// `pnpm agreement`: how far each judge agrees with your labels. Prints TPR,
// TNR, Cohen's κ and a confusion matrix per judge on judge-test, the same on
// judge-dev marked as tuned on, before and after for every changed judge
// version, the judge-dev mistakes you may tune against, and the bias checks;
// then rewrites docs/judge-validation.md. Sends no model calls.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { styleText } from "node:util";
import { loadConfig, PROJECT_ROOT } from "../src/config";
import { dim, fatal } from "../src/eval/session";
import { loadRubric } from "../src/judge/rubric";
import { agreementReport, type AgreementRow, type SplitAgreement } from "../src/labels/agreement";
import { barVerdict, headline, JUDGE_NAMES, kappaText, rateText, validationDoc } from "../src/labels/doc";
import { readBar, readBiasResults, readLabels, readSnapshots } from "../src/labels/files";
import { snapshotLabelledTrials } from "../src/labels/pick";
import type { Bar } from "../src/labels/schema";

const DOC = join(PROJECT_ROOT, "docs", "judge-validation.md");

function printTable(split: SplitAgreement, bar: Bar | null): void {
  const cells = (r: AgreementRow) => {
    const a = r.agreement;
    return [r.name, `${r.tasks}`, `${r.trials}`, `${r.items}`, a ? rateText(a.tprEstimate) : "–", a ? rateText(a.tnrEstimate) : "–", a ? kappaText(a.kappaEstimate) : "–", barVerdict(r, bar)];
  };
  const rows = [["", "tasks", "trials", "labels", "TPR", "TNR", "κ", "bar"], ...split.rows.map(cells)];
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  rows.forEach((r, i) => {
    const line = `    ${r.map((c, j) => c.padEnd(widths[j])).join("  ")}`;
    console.log(i === 0 ? dim(line) : line);
  });
  const row = split.rows.at(-1)?.agreement;
  if (row) console.log(dim(`    matrix (you × judge): caught ${row.truePositives} · missed ${row.falseNegatives} · false alarm ${row.falsePositives} · left alone ${row.trueNegatives}`));
  if (split.ungraded > 0) console.log(styleText("yellow", `    ${split.ungraded} of ${split.trials} trials couldn't be read by the judge; left out.`));
  if (split.unmatchedClaims > 0) console.log(styleText("yellow", `    ${split.unmatchedClaims} of your claim labels had no claim with the same words from this checker; left out.`));
}

function main(): void {
  const config = loadConfig();
  const judge = config.judge;
  const now = new Date();
  try {
    // Copies the judges' current verdicts on labelled trials, in case they
    // were judged after the label was saved.
    const labelled = readLabels();
    for (const runId of new Set(labelled.map((l) => l.runId))) snapshotLabelledTrials(runId, now);

    const labels = readLabels();
    if (labels.length === 0) fatal("No labels yet. Start `pnpm dev` and open /labelling to label trials.");
    const current = { judge: `${judge.model} · rubric ${loadRubric(judge.rubricVersion).version}`, claims: `${judge.model} · claims ${judge.claimsPromptVersion}` };
    const bar = readBar();
    const bias = readBiasResults();
    const report = agreementReport(labels, readSnapshots(), current);

    const s = report.labels.bySplit;
    console.log(styleText("bold", `VerifAI agreement · ${labels.length} labels · judge-test ${s["judge-test"].trials} trials (${s["judge-test"].tasks} tasks) · judge-dev ${s["judge-dev"].trials} trials (${s["judge-dev"].tasks} tasks)`));
    console.log(dim("  κ (Cohen's kappa) is agreement beyond chance: 1 perfect, 0 chance. TPR: real failures caught. TNR: good ones left alone. Intervals are 95%, by task."));
    if (bar) console.log(dim(`  Bar: κ ≥ ${bar.minKappa} on judge-test (decided ${bar.decidedAt}).`));
    else console.log(styleText("yellow", "  No bar written down: evals/labels/bar.json is missing, so nothing can be called acceptable."));

    const inConfig = report.versions.filter((v) => v.judge === current[v.kind]);
    if (inConfig.length === 0) console.log(styleText("yellow", `\n  The judges in the config haven't read any labelled trial. Run \`pnpm judge <run>\` and \`pnpm claims <run>\` on the labelled runs.`));
    for (const v of inConfig) {
      console.log(styleText("bold", `\n  ${JUDGE_NAMES[v.kind]} · ${v.judge}`));
      console.log("   judge-test");
      printTable(v.bySplit["judge-test"], bar);
      console.log(dim("   judge-dev (tuned on: flatters the judge)"));
      printTable(v.bySplit["judge-dev"], bar);
    }

    for (const c of report.comparisons) {
      console.log(styleText("bold", `\n  Before → after on judge-test · ${JUDGE_NAMES[c.kind]} · ${c.trials} trials both read`));
      console.log(dim(`    ${c.before} → ${c.after}`));
      for (const r of c.rows) {
        const b = r.before.agreement;
        const a = r.after.agreement;
        console.log(`    ${r.name.padEnd(28)} κ ${b ? kappaText(b.kappaEstimate) : "–"} → ${a ? kappaText(a.kappaEstimate) : "–"}`);
      }
      console.log(dim("    Overlapping intervals mean the change can't be told from noise."));
    }

    if (report.devMistakes.length > 0) {
      console.log(styleText("bold", `\n  Where the current judges disagree with you on judge-dev (${report.devMistakes.length}) — the only mistakes to tune against`));
      for (const m of report.devMistakes) {
        console.log(`    ${dim(`${m.runId}/${m.taskId}/${m.tryNumber}`)}  ${m.what}: you ${m.yours}, judge ${m.judges}`);
        console.log(dim(`      judge's reason: ${m.reason}`));
      }
    }

    if (bias.length > 0) {
      const latest = new Map(bias.map((b) => [`${b.check}|${b.judge}`, b]));
      console.log(styleText("bold", "\n  Bias checks"));
      for (const b of latest.values()) console.log(`    ${b.check.padEnd(8)} ${b.changed} of ${b.verdicts} verdicts changed · ${b.trials} trials, ${b.tasks} tasks · ${dim(b.judge)}`);
    }

    writeFileSync(DOC, validationDoc({ report, bar, bias, current, generatedAt: now.toISOString().slice(0, 10) }));
    console.log("");
    for (const v of inConfig) {
      const h = headline(v);
      if (h) console.log(styleText("bold", `  ${h}`));
    }
    console.log(dim("\n  Written: docs/judge-validation.md"));
  } catch (error) {
    fatal(error instanceof Error ? error.message : String(error));
  }
}

main();
