// The files under evals/labels/: your labels, the judges' verdicts on the
// same trials, the bar for "acceptable" and the bias checks. The only code
// that reads or writes them. Every line is checked; a bad one stops whatever
// is reading, never skipped quietly.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { PROJECT_ROOT } from "../config";
import type { ClaimCheck, JudgeCheck } from "../results/schema";
import { judgeCheckLabel } from "../stats/judge";
import {
  barSchema,
  biasResultSchema,
  judgeSnapshotSchema,
  labelSchema,
  resplitSchema,
  trialKey,
  type Bar,
  type BiasResult,
  type JudgeSnapshot,
  type JudgeSplit,
  type Label,
  type Resplit,
  type TrialRef,
} from "./schema";

export type LabelFiles = { labels: string; snapshots: string; bar: string; bias: string; resplit: string };

const DIR = join(PROJECT_ROOT, "evals", "labels");
export const LABEL_FILES: LabelFiles = {
  labels: join(DIR, "labels.jsonl"),
  snapshots: join(DIR, "judge-verdicts.jsonl"),
  bar: join(DIR, "bar.json"),
  bias: join(DIR, "bias.jsonl"),
  resplit: join(DIR, "resplit.json"),
};

const shown = (path: string) => path.replace(`${PROJECT_ROOT}/`, "");

function readLines<T>(path: string, schema: z.ZodType<T>): T[] {
  if (!existsSync(/*turbopackIgnore: true*/ path)) return [];
  return readFileSync(/*turbopackIgnore: true*/ path, "utf8")
    .split("\n")
    .flatMap((line, i) => {
      if (line.trim() === "") return [];
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch {
        throw new Error(`${shown(path)} line ${i + 1} isn't valid JSON. Fix it or restore the file from git.`);
      }
      const parsed = schema.safeParse(raw);
      if (!parsed.success) throw new Error(`${shown(path)} line ${i + 1} doesn't match the expected shape:\n${z.prettifyError(parsed.error)}`);
      return [parsed.data];
    });
}

function appendLines(path: string, rows: unknown[]): void {
  if (rows.length === 0) return;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(/*turbopackIgnore: true*/ path, rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
}

// Every label, checked: one per trial, and every trial of one task on the
// same side of the split.
export function readLabels(files: LabelFiles = LABEL_FILES): Label[] {
  const labels = readLines(files.labels, labelSchema);
  const seen = new Set<string>();
  const sideOf = new Map<string, JudgeSplit>();
  for (const l of labels) {
    const key = trialKey(l);
    if (seen.has(key)) throw new Error(`${shown(files.labels)} labels ${key} twice. Keep one of the two lines.`);
    seen.add(key);
    const side = sideOf.get(l.taskId);
    if (side !== undefined && side !== l.split) {
      throw new Error(`${shown(files.labels)} has ${l.taskId} in both ${side} and ${l.split}. Tries of one task stay on one side; the split must not be edited by hand.`);
    }
    sideOf.set(l.taskId, l.split);
  }
  return labels;
}

// Which side a task's labels go to, decided once at random: a fixed hash of
// the task id, so it can't be rerolled and doesn't move as labels are added.
// Whole tasks, not single tries: tries of one task read nearly the same, so
// splitting them would let a fix made on one show up as a gain on another.
// A task already labelled keeps the side its labels are on.
export function splitFor(taskId: string, labels: Label[]): JudgeSplit {
  const existing = labels.find((l) => l.taskId === taskId);
  if (existing) return existing.split;
  const draw = createHash("sha256").update(`verifai judge split:${taskId}`).digest().readUInt32BE(0) / 2 ** 32;
  return draw < 0.5 ? "judge-dev" : "judge-test";
}

export function appendLabel(label: Label, files: LabelFiles = LABEL_FILES): void {
  appendLines(files.labels, [labelSchema.parse(label)]);
}

export const readSnapshots = (files: LabelFiles = LABEL_FILES): JudgeSnapshot[] => readLines(files.snapshots, judgeSnapshotSchema);

export const claimsCheckLabel = (check: Pick<ClaimCheck, "model" | "promptVersion">): string => `${check.model} · claims ${check.promptVersion}`;

export const snapshotJudge = (s: JudgeSnapshot): string => (s.kind === "judge" ? judgeCheckLabel(s.check) : claimsCheckLabel(s.check));
const snapshotKey = (s: JudgeSnapshot) => `${s.kind}|${trialKey(s)}|${snapshotJudge(s)}`;

// Copies what each judge said about these trials into judge-verdicts.jsonl,
// once per trial and judge version: a version already copied stays as it was
// first seen. Returns how many lines were added.
export function recordSnapshots(trials: (TrialRef & { judge: JudgeCheck | null; claims: ClaimCheck | null })[], now: Date, files: LabelFiles = LABEL_FILES): number {
  const have = new Set(readSnapshots(files).map(snapshotKey));
  const recordedAt = now.toISOString();
  const add: JudgeSnapshot[] = [];
  for (const t of trials) {
    const ref = { runId: t.runId, taskId: t.taskId, tryNumber: t.tryNumber };
    const candidates: JudgeSnapshot[] = [];
    if (t.judge) candidates.push({ kind: "judge", ...ref, recordedAt, check: t.judge });
    if (t.claims) candidates.push({ kind: "claims", ...ref, recordedAt, check: t.claims });
    for (const s of candidates) {
      if (have.has(snapshotKey(s))) continue;
      have.add(snapshotKey(s));
      add.push(s);
    }
  }
  appendLines(files.snapshots, add);
  return add.length;
}

// Null when it hasn't been written down yet.
// Null when the split was never redrawn.
export function readResplit(files: LabelFiles = LABEL_FILES): Resplit | null {
  if (!existsSync(/*turbopackIgnore: true*/ files.resplit)) return null;
  const parsed = resplitSchema.safeParse(JSON.parse(readFileSync(/*turbopackIgnore: true*/ files.resplit, "utf8")));
  if (!parsed.success) throw new Error(`${shown(files.resplit)} doesn't match the expected shape:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

// Moves every label to its task's new side and writes down what moved.
// Once only: a split redrawn again and again could be redrawn until a judge
// looks good.
export function applyResplit(sides: Map<string, JudgeSplit>, record: Resplit, files: LabelFiles = LABEL_FILES): void {
  const done = readResplit(files);
  if (done !== null) throw new Error(`The split was already redrawn on ${done.at}; it isn't redrawn twice.`);
  const labels = readLabels(files).map((l) => {
    const split = sides.get(l.taskId);
    if (split === undefined) throw new Error(`No new side for ${l.taskId}.`);
    return labelSchema.parse({ ...l, split });
  });
  writeFileSync(/*turbopackIgnore: true*/ files.labels, labels.map((l) => `${JSON.stringify(l)}\n`).join(""));
  writeFileSync(/*turbopackIgnore: true*/ files.resplit, `${JSON.stringify(resplitSchema.parse(record), null, 2)}\n`);
}

export function readBar(files: LabelFiles = LABEL_FILES): Bar | null {
  if (!existsSync(/*turbopackIgnore: true*/ files.bar)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(/*turbopackIgnore: true*/ files.bar, "utf8"));
  } catch {
    throw new Error(`${shown(files.bar)} isn't valid JSON.`);
  }
  const parsed = barSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`${shown(files.bar)} doesn't match the expected shape:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

export const readBiasResults = (files: LabelFiles = LABEL_FILES): BiasResult[] => readLines(files.bias, biasResultSchema);
export const appendBiasResult = (result: BiasResult, files: LabelFiles = LABEL_FILES): void => appendLines(files.bias, [biasResultSchema.parse(result)]);
