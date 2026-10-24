// `pnpm chart`: writes the improvement page's chart to docs/improvement.svg
// for the README, from the same files and the same component as the page.
// Sends no model calls.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { styleText } from "node:util";
import { chartSvg } from "../components/improvement/export";
import { PROJECT_ROOT } from "../src/config";
import { dim, fatal } from "../src/eval/session";
import { loadImprovement } from "../src/improvement/load";

const OUT = join(PROJECT_ROOT, "docs", "improvement.svg");

function main(): void {
  try {
    const { versions, notPromoted, problems } = loadImprovement();
    for (const m of problems) console.log(styleText("yellow", `  ${m}`));
    if (versions.length === 0) {
      fatal(`No version has been promoted yet${notPromoted.length > 0 ? ` (${notPromoted.length} gates tried, none passed)` : ""}, so there's nothing to draw. Run \`pnpm gate <name>\` first.`);
    }
    // A point that couldn't be measured is left off the image; say which and why.
    for (const v of versions) {
      const measures = { "holdout success": v.holdout, "hallucination rate": v.hallucination, "cost per success": v.cost, "category counts": v.categories };
      for (const [label, m] of Object.entries(measures)) if (!m.ok) console.log(styleText("yellow", `  ${v.version} has no ${label}: ${m.reason}`));
    }
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, chartSvg(versions));
    console.log(`  Drew ${versions.map((v) => v.version).join(", ")}.`);
    console.log(dim(`  Wrote docs/improvement.svg. It's the chart on /improvement, in light colours.`));
  } catch (error) {
    fatal(error instanceof Error ? error.message : String(error));
  }
}

main();
