// The dashboard's only source: the files under results/. Never the eval store,
// so the pages read the same here and deployed. Every line is checked.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { PROJECT_ROOT } from "../config";
import { RESULT_FILES, reportSchema, sealedTrialSchema, trialSchema, type Report, type SealedTrial, type Trial } from "./schema";

const RESULTS_DIR = join(PROJECT_ROOT, "results");
const RUN_ID = /^[A-Za-z0-9_-]+$/;

export type RunListing = { runs: Report[]; problems: string[] };

export type RunFiles =
  | { report: Report; split: "dev"; trials: Trial[] }
  | { report: Report; split: "holdout"; trials: SealedTrial[] };

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
    if (!entry.isDirectory() || !RUN_ID.test(entry.name)) continue;
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
  return report.split === "holdout"
    ? { report, split: "holdout", trials: parseLines(sealedTrialSchema) }
    : { report, split: "dev", trials: parseLines(trialSchema) };
}
