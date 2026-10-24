// The dashboard's only source: the files under results/. Never the eval store,
// so the pages read the same here and deployed. Every line is checked.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { PROJECT_ROOT } from "../config";
import { compareRuns, outcomeRow, widestNoise, type Comparison } from "../stats/report";
import {
  NOISE_FLOORS_FILE,
  noiseFloorSchema,
  RESULT_FILES,
  reportSchema,
  sealedTrialSchema,
  trialSchema,
  type NoiseFloor,
  type Report,
  type SealedTrial,
  type Trial,
} from "./schema";

const RESULTS_DIR = join(PROJECT_ROOT, "results");
const RUN_ID = /^[A-Za-z0-9_-]+$/;

export type RunListing = { runs: Report[]; problems: string[] };

// `sealed` is a holdout run whose version hasn't passed the gate: outcomes only.
export type RunFiles =
  | { report: Report; sealed: false; trials: Trial[] }
  | { report: Report; sealed: true; trials: SealedTrial[] };

export const isSealed = (report: Report): boolean => report.split === "holdout" && report.promotedAs === null;

// A dev run's tries, or null. The judge, labelling and review read only these:
// a promoted holdout run is readable, but nothing is ever fixed from it.
export const devTrials = (files: RunFiles | null): Trial[] | null =>
  files === null || files.sealed || files.report.split !== "dev" ? null : files.trials;

function readJson(path: string, label: string): unknown {
  try {
    return JSON.parse(readFileSync(/*turbopackIgnore: true*/ path, "utf8"));
  } catch (error) {
    throw new Error(`${label} isn't readable JSON (${error instanceof Error ? error.message : String(error)}).`);
  }
}

function readReport(runId: string): Report {
  const label = `results/${runId}/${RESULT_FILES.json}`;
  const parsed = reportSchema.safeParse(readJson(join(RESULTS_DIR, runId, RESULT_FILES.json), label));
  if (!parsed.success) throw new Error(`${label} doesn't match the expected shape:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

export function listRuns(): RunListing {
  if (!existsSync(/*turbopackIgnore: true*/ RESULTS_DIR)) return { runs: [], problems: [] };
  const runs: Report[] = [];
  const problems: string[] = [];
  for (const entry of readdirSync(/*turbopackIgnore: true*/ RESULTS_DIR, { withFileTypes: true })) {
    // results/gates/ holds gate records and results/online/ traffic batches, not runs.
    if (!entry.isDirectory() || !RUN_ID.test(entry.name) || entry.name === "gates" || entry.name === "online") continue;
    try {
      runs.push(readReport(entry.name));
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  runs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.runId.localeCompare(a.runId)));
  return { runs, problems };
}

// Null when there's no such run.
export function readRun(runId: string): RunFiles | null {
  if (!RUN_ID.test(runId) || !existsSync(/*turbopackIgnore: true*/ join(RESULTS_DIR, runId, RESULT_FILES.json))) return null;
  const report = readReport(runId);
  const label = `results/${runId}/${RESULT_FILES.trials}`;
  const path = join(RESULTS_DIR, runId, RESULT_FILES.trials);
  if (!existsSync(/*turbopackIgnore: true*/ path)) throw new Error(`${label} is missing. Write the run's results again.`);
  const lines = readFileSync(/*turbopackIgnore: true*/ path, "utf8").split("\n").filter((line) => line.trim() !== "");
  const parseLines = <T,>(schema: z.ZodType<T>): T[] =>
    lines.map((line, i) => {
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch {
        throw new Error(`${label} line ${i + 1} isn't valid JSON.`);
      }
      const parsed = schema.safeParse(raw);
      if (!parsed.success) throw new Error(`${label} line ${i + 1} doesn't match the expected shape:\n${z.prettifyError(parsed.error)}`);
      return parsed.data;
    });
  return isSealed(report)
    ? { report, sealed: true, trials: parseLines(sealedTrialSchema) }
    : { report, sealed: false, trials: parseLines(trialSchema) };
}

export type NoiseFloors = { floors: Map<string, NoiseFloor>; problems: string[] };

// The newest measurement for each configuration. A bad line is reported, not
// skipped quietly, and never stands in as a floor.
export function readNoiseFloors(): NoiseFloors {
  const path = join(RESULTS_DIR, NOISE_FLOORS_FILE);
  const floors = new Map<string, NoiseFloor>();
  const problems: string[] = [];
  if (!existsSync(/*turbopackIgnore: true*/ path)) return { floors, problems };
  readFileSync(/*turbopackIgnore: true*/ path, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (line.trim() === "") return;
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch {
        problems.push(`results/${NOISE_FLOORS_FILE} line ${i + 1} isn't valid JSON.`);
        return;
      }
      const parsed = noiseFloorSchema.safeParse(raw);
      if (!parsed.success) {
        problems.push(`results/${NOISE_FLOORS_FILE} line ${i + 1} doesn't match the expected shape:\n${z.prettifyError(parsed.error)}`);
        return;
      }
      const seen = floors.get(parsed.data.configKey);
      if (!seen || seen.measuredAt <= parsed.data.measuredAt) floors.set(parsed.data.configKey, parsed.data);
    });
  return { floors, problems };
}

// The floor two runs are judged against: one measured for either run's
// configuration. When both have one, the wider, so nothing is called a change
// that either configuration's own noise could explain.
export function floorFor(a: Report, b: Report, floors: Map<string, NoiseFloor>): NoiseFloor | null {
  const found = [floors.get(a.configKey), floors.get(b.configKey)].filter((f): f is NoiseFloor => f !== undefined);
  if (found.length === 0) return null;
  return found.reduce((x, y) => (y.overall.floor > x.overall.floor ? y : x));
}

// What differs between two runs' configurations, in words, so a comparison of
// unlike runs says so.
export function configDifferences(a: Report, b: Report): string[] {
  const out: string[] = [];
  const check = (label: string, x: unknown, y: unknown) => {
    if (JSON.stringify(x) !== JSON.stringify(y)) out.push(`${label}: ${String(x)} → ${String(y)}`);
  };
  check("split", a.split, b.split);
  check("dataset", a.datasetVersion, b.datasetVersion);
  check("model", a.agent.model, b.agent.model);
  check("providers", a.agent.pool.join(", "), b.agent.pool.join(", "));
  check("temperature", a.agent.temperature, b.agent.temperature);
  check("reasoning", a.agent.reasoningEffort, b.agent.reasoningEffort);
  check("prompt", a.agent.promptVersion, b.agent.promptVersion);
  check("tools", a.agent.toolDescriptionsVersion, b.agent.toolDescriptionsVersion);
  check("validation", a.agent.validation ?? "none", b.agent.validation ?? "none");
  check("exemplars", a.agent.exemplars ? "on" : "off", b.agent.exemplars ? "on" : "off");
  check("max steps", a.agent.maxSteps, b.agent.maxSteps);
  check("tries per task", a.triesPerTask, b.triesPerTask);
  check("cache", a.useCache ? "on" : "off", b.useCache ? "on" : "off");
  // Something outside the list above differs (a step timeout, a price), so
  // the runs still don't share a configuration.
  if (out.length === 0) check("configuration key", a.configKey, b.configKey);
  return out;
}

export type RunComparison = { a: RunFiles; b: RunFiles; comparison: Comparison; floor: NoiseFloor | null; differences: string[] };

export function compareRunFiles(a: RunFiles, b: RunFiles, floors: Map<string, NoiseFloor>): RunComparison {
  const floor = floorFor(a.report, b.report, floors);
  const measured = [floors.get(a.report.configKey), floors.get(b.report.configKey)].filter((f): f is NoiseFloor => f !== undefined);
  const noise = widestNoise(measured.map((f) => ({ overall: f.overall, byCategory: f.byCategory })));
  const rows = (r: RunFiles) => (r.sealed ? r.trials.map(outcomeRow) : r.trials.map(outcomeRow));
  return { a, b, comparison: compareRuns(rows(a), rows(b), noise), floor, differences: configDifferences(a.report, b.report) };
}
