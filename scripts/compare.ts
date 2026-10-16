// `pnpm compare <runA> <runB>`: two finished runs side by side, overall and per
// category, on the tasks they share. B minus A, its 95% interval, McNemar's p
// and a verdict against the noise floor. Reads only results/, spends nothing.
import { styleText } from "node:util";
import { compareRunFiles, readNoiseFloors, readRun, type RunFiles } from "../src/results/read";
import { interval, pct, points, pValue, VERDICT_WORDS } from "../src/stats/format";
import type { ComparisonRow } from "../src/stats/report";
import type { Verdict } from "../src/stats/stats";

const dim = (text: string) => styleText("dim", text);
const USAGE = "Usage: pnpm compare <runA> <runB>   (run ids are the folder names under results/)";

function fatal(message: string): never {
  console.error(styleText("red", `✗ ${message}`));
  process.exit(1);
}

function load(runId: string): RunFiles {
  let run: RunFiles | null;
  try {
    run = readRun(runId);
  } catch (error) {
    fatal(error instanceof Error ? error.message : String(error));
  }
  if (run === null) fatal(`There's no run ${runId} under results/. \`pnpm eval\` makes one; the runs page lists them.`);
  if (run.report.smoke) fatal(`${runId} is a smoke run. It checks the machinery and is never compared; use a full \`pnpm eval\` run.`);
  return run;
}

const VERDICT_STYLE: Record<Verdict, Parameters<typeof styleText>[0]> = {
  better: ["green", "bold"],
  worse: ["red", "bold"],
  "within-noise": "yellow",
  "no-noise-floor": "dim",
};

function main(): void {
  const ids = process.argv.slice(2);
  if (ids.length !== 2) fatal(USAGE);
  const [a, b] = ids.map(load);
  const { floors, problems } = readNoiseFloors();
  for (const p of problems) console.log(styleText("yellow", `⚠ ${p}`));
  const { comparison: c, floor, differences } = compareRunFiles(a, b, floors);

  console.log(styleText("bold", `VerifAI compare · A ${a.report.runId} → B ${b.report.runId}`));
  if (floor) {
    console.log(`  Noise floor ${styleText("bold", `${points(floor.overall.floor, false)} points`)} · flip rate ${pct(floor.overall.flipRate)} ${dim(`(measured ${floor.measuredAt.slice(0, 10)} from runs ${floor.runs.join(" and ")}, ${floor.overall.tasks} tasks)`)}`);
  } else {
    console.log(styleText("yellow", "  No noise floor for either run's configuration, so there's no verdict. Run `pnpm noise` to measure one."));
  }
  if (differences.length > 0) console.log(styleText("yellow", `  Different configurations: ${differences.join(" · ")}`));
  else console.log(dim("  Same configuration."));
  if (c.onlyInA.length + c.onlyInB.length > 0) {
    console.log(styleText("yellow", `  Compared on the ${c.sharedTasks} tasks both have. Only in A: ${c.onlyInA.join(", ") || "none"}. Only in B: ${c.onlyInB.join(", ") || "none"}.`));
  }
  if (c.sharedTasks === 0) fatal("The two runs share no tasks, so there's nothing to compare.");

  const header = ["", "tasks", "A", "B", "B − A", "95% interval", "McNemar p", "floor", "verdict"];
  const row = (label: string, r: ComparisonRow) => [
    label,
    String(r.tasks),
    pct(r.aRate),
    pct(r.bRate),
    points(r.difference.value),
    interval(r.difference),
    `${pValue(r.mcnemar.p)} (${r.mcnemar.onlyA}/${r.mcnemar.onlyB})`,
    r.floor === null ? "–" : points(r.floor, false),
    VERDICT_WORDS[r.verdict],
  ];
  const rows: [string[], Verdict][] = [[row("all", c.overall), c.overall.verdict], ...Object.entries(c.byCategory).map(([k, r]): [string[], Verdict] => [row(k, r), r.verdict])];
  const widths = header.map((_, i) => Math.max(header[i].length, ...rows.map(([r]) => r[i].length)));
  const line = (r: string[]) => r.map((cell, i) => (i === 0 || i === r.length - 1 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join("  ");
  console.log(`\n  ${dim(line(header))}`);
  rows.forEach(([r, v], i) => {
    if (i === 1) console.log("");
    console.log(`  ${line(r.slice(0, -1))}  ${styleText(VERDICT_STYLE[v], r[r.length - 1])}`);
  });
  console.log(dim(`\n  Rates are success rates on the shared tasks (${a.report.triesPerTask} and ${b.report.triesPerTask} tries each). Differences are in points.`));
  console.log(dim("  McNemar counts tasks most of whose tries passed in only one run (A only / B only); p is the chance of a split that uneven with no real change."));
  console.log(dim("  Better or worse needs all three: bigger than the floor, an interval clear of zero, and p under 0.05. Anything else is within noise."));
}

main();
