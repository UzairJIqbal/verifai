// What the gate writes: its record (always), and on a pass the promotion: the
// config's agent keys, and a CHANGELOG.md entry.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { PROJECT_ROOT } from "../config";
import type { AgentKnobs } from "../agent/versions";
import type { Comparison, ComparisonRow } from "../stats/report";
import { CATEGORIES, type Category } from "../tasks/schema";
import { gateRecordSchema, type GateRecord, type GateRow } from "./schema";

export const GATES_DIR_NAME = "gates";
export const GATES_DIR = join(PROJECT_ROOT, "results", GATES_DIR_NAME);
export const CONFIG_FILE = join(PROJECT_ROOT, "verifai.config.json");
export const CHANGELOG_FILE = join(PROJECT_ROOT, "CHANGELOG.md");

const finite = (x: number | null): number | null => (x === null || Number.isNaN(x) ? null : x);

export const gateRow = (r: ComparisonRow): GateRow => ({
  tasks: r.tasks,
  aRate: r.aRate,
  bRate: r.bRate,
  difference: r.difference,
  p: r.mcnemar.p,
  floor: finite(r.floor),
  verdict: r.verdict,
});

export function gateComparison(c: Comparison): GateRecord["dev"] {
  const byCategory: Partial<Record<Category, GateRow>> = {};
  for (const cat of CATEGORIES) {
    const row = c.byCategory[cat];
    if (row !== undefined) byCategory[cat] = gateRow(row);
  }
  return { overall: gateRow(c.overall), byCategory };
}

// e.g. 20261021-101500-v2.json: sorts by when it ran.
export function gateRecordPath(record: Pick<GateRecord, "decidedAt" | "name">, dir: string = GATES_DIR): string {
  const stamp = record.decidedAt.replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return join(dir, `${stamp}-${record.name}.json`);
}

export function writeGateRecord(record: GateRecord, dir: string = GATES_DIR): string {
  mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
  const path = gateRecordPath(record, dir);
  writeFileSync(/*turbopackIgnore: true*/ path, `${JSON.stringify(gateRecordSchema.parse(record), null, 2)}\n`);
  return path;
}

/**
 * The files as they are now, and a way to put them back: a file that didn't
 * exist is removed. Promotion takes one before it writes anything, so a
 * failure halfway leaves no file saying the candidate was promoted.
 */
export function snapshotFiles(paths: string[]): () => void {
  const before = paths.map((path) => ({ path, text: existsSync(/*turbopackIgnore: true*/ path) ? readFileSync(/*turbopackIgnore: true*/ path, "utf8") : null }));
  return () => {
    for (const { path, text } of before) {
      if (text === null) rmSync(/*turbopackIgnore: true*/ path, { force: true });
      else writeFileSync(/*turbopackIgnore: true*/ path, text);
    }
  };
}

export type GateListing = { gates: GateRecord[]; problems: string[] };

// Newest first. A bad file is reported, never skipped quietly.
export function listGates(dir: string = GATES_DIR): GateListing {
  if (!existsSync(/*turbopackIgnore: true*/ dir)) return { gates: [], problems: [] };
  const gates: GateRecord[] = [];
  const problems: string[] = [];
  for (const file of readdirSync(/*turbopackIgnore: true*/ dir).filter((f) => f.endsWith(".json")).sort().reverse()) {
    try {
      const parsed = gateRecordSchema.safeParse(JSON.parse(readFileSync(/*turbopackIgnore: true*/ join(dir, file), "utf8")));
      if (parsed.success) gates.push(parsed.data);
      else problems.push(`results/${GATES_DIR_NAME}/${file} doesn't match the expected shape:\n${z.prettifyError(parsed.error)}`);
    } catch {
      problems.push(`results/${GATES_DIR_NAME}/${file} isn't valid JSON.`);
    }
  }
  return { gates, problems };
}

export type PromotedKnobs = AgentKnobs & { agentVersion: string };

/**
 * The config with the promoted version's keys changed and nothing else: each
 * key's value is replaced in place, so the file's layout and every other
 * setting stay exactly as they were. Throws if a key isn't there exactly once.
 */
export function rewriteConfigText(text: string, next: PromotedKnobs): string {
  const values: [keyof PromotedKnobs, string][] = [
    ["agentVersion", JSON.stringify(next.agentVersion)],
    ["promptVersion", JSON.stringify(next.promptVersion)],
    ["toolDescriptionsVersion", JSON.stringify(next.toolDescriptionsVersion)],
    ["validation", JSON.stringify(next.validation)],
    ["exemplars", JSON.stringify(next.exemplars)],
  ];
  let out = text;
  for (const [key, value] of values) {
    const pattern = new RegExp(`("${key}"\\s*:\\s*)("[^"]*"|null|true|false)`, "g");
    const found = out.match(pattern)?.length ?? 0;
    if (found !== 1) throw new Error(`verifai.config.json has "${key}" ${found} times, not once. Nothing was changed.`);
    out = out.replace(pattern, (_, lead: string) => `${lead}${value}`);
  }
  return out;
}

const signed = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}`;
const rate = (x: number) => `${(x * 100).toFixed(1)}%`;

function metricLine(label: string, r: GateRow, tasks: number, tries: number): string {
  return (
    `- ${label}: ${rate(r.aRate)} → ${rate(r.bRate)}, ${signed(r.difference.value)} points ` +
    `(95% interval ${signed(r.difference.lo)} to ${signed(r.difference.hi)}; McNemar p ${r.p < 0.001 ? "< 0.001" : r.p.toFixed(3)}; ` +
    `noise floor ${r.floor === null ? "none" : `${(r.floor * 100).toFixed(1)} points`}) · ${tasks} tasks × ${tries} tries`
  );
}

// The entry a promotion adds to CHANGELOG.md.
export function changelogEntry(record: GateRecord, gateFile: string): string {
  const day = record.decidedAt.slice(0, 10);
  const cats = (c: GateRecord["dev"]) =>
    CATEGORIES.flatMap((cat) => {
      const r = c.byCategory[cat];
      return r ? [`${cat} ${signed(r.difference.value)}`] : [];
    }).join(", ");
  return [
    `## ${record.name} · ${day}`,
    "",
    `- What changed: ${record.change} (on top of ${record.basedOn}: ${record.promotedLabel}).`,
    `- Why: ${record.why}`,
    `- Target: ${record.targets}, the top category of the latest failure taxonomy${record.topCategory === record.targets ? "" : ` (top was ${record.topCategory})`}.`,
    `- Dataset: ${record.datasetVersion}.`,
    metricLine("Holdout success", record.holdout.overall, record.holdout.overall.tasks, record.triesPerTask),
    metricLine("Dev success", record.dev.overall, record.dev.overall.tasks, record.triesPerTask),
    `- By category, points: holdout ${cats(record.holdout)}; dev ${cats(record.dev)}. None dropped more than ${record.maxCategoryDropPoints}.`,
    `- Noise floor from configuration ${record.floor.configKey} (dataset ${record.floor.datasetVersion}, ${record.floor.tasks} tasks, measured ${record.floor.measuredAt.slice(0, 10)}), rescaled to each slice's task count; the holdout floor is estimated from dev, since holdout is never run twice to measure its own.`,
    `- Runs: dev ${record.runs.promotedDev} → ${record.runs.candidateDev}; holdout ${record.runs.promotedHoldout} → ${record.runs.candidateHoldout}. Gate record: ${gateFile}.`,
    "",
  ].join("\n");
}

const CHANGELOG_HEAD = "# Changelog\n\nEvery promoted agent version: what changed, why, and what the gate measured.\n\n";

// Newest at the top, under the heading.
export function addChangelogEntry(entry: string, path: string = CHANGELOG_FILE): void {
  const old = existsSync(/*turbopackIgnore: true*/ path) ? readFileSync(/*turbopackIgnore: true*/ path, "utf8") : CHANGELOG_HEAD;
  const body = old.startsWith(CHANGELOG_HEAD) ? old.slice(CHANGELOG_HEAD.length) : old;
  writeFileSync(/*turbopackIgnore: true*/ path, `${CHANGELOG_HEAD}${entry}\n${body}`);
}
