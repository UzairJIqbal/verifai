// A regression task in the making: a reviewed dev failure turned into a draft
// under evals/drafts/, which you finish by hand and add with `pnpm task:add`.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { PROJECT_ROOT } from "../config";
import { taskSchema, type Task } from "./schema";

export const DRAFTS_DIR = join(PROJECT_ROOT, "evals", "drafts");

// Left in the note until you've written your own, so an unfinished draft
// can't be added.
export const DRAFT_MARK = "EDIT ME:";

const fromSchema = z.strictObject({
  runId: z.string().min(1),
  taskId: z.string().min(1),
  tryNumber: z.number().int().positive(),
  datasetVersion: z.string().min(1),
  failureCategory: z.string().nullable(),
  reviewNote: z.string(),
});
export type DraftSource = z.infer<typeof fromSchema>;

// The task as it'll be added, plus where it came from (dropped on adding).
export const draftSchema = taskSchema.extend({ _from: fromSchema });
export type Draft = z.infer<typeof draftSchema>;

/**
 * The failed task, copied under a new dev id, with the review note attached.
 * What makes it a new task (a different message, order or twist that catches
 * the same failure) is yours to write.
 */
export function makeDraft(source: Task, id: string, from: DraftSource): Draft {
  return {
    ...source,
    id,
    split: "dev",
    note: `${DRAFT_MARK} what this task checks. Regression for ${from.runId}/${from.taskId}#${from.tryNumber}${from.failureCategory ? ` (${from.failureCategory})` : ""}: ${from.reviewNote}`,
    _from: from,
  };
}

export function draftPath(id: string, dir: string = DRAFTS_DIR): string {
  if (!/^[a-z]+-\d{2}$/.test(id)) throw new Error(`A draft is named by its task id, like cancel-11, not "${id}".`);
  return join(dir, `${id}.json`);
}

// The ids of drafts waiting to be added, so a new draft doesn't take one.
export const draftIds = (dir: string = DRAFTS_DIR): string[] =>
  existsSync(/*turbopackIgnore: true*/ dir)
    ? readdirSync(/*turbopackIgnore: true*/ dir)
        .filter((f) => /^[a-z]+-\d{2}\.json$/.test(f))
        .map((f) => f.slice(0, -5))
    : [];

export function writeDraft(draft: Draft, dir: string = DRAFTS_DIR): string {
  const path = draftPath(draft.id, dir);
  if (existsSync(/*turbopackIgnore: true*/ path)) throw new Error(`evals/drafts/${draft.id}.json already exists. Finish it, or delete it to start over.`);
  mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
  writeFileSync(/*turbopackIgnore: true*/ path, `${JSON.stringify(draftSchema.parse(draft), null, 2)}\n`);
  return path;
}

// The finished task and why it's being added. Refuses a draft whose note
// still has the mark, or whose message is the failed task's word for word.
export function readDraft(id: string, source: Task | null, dir: string = DRAFTS_DIR): { task: Task; from: DraftSource } {
  const path = draftPath(id, dir);
  if (!existsSync(/*turbopackIgnore: true*/ path)) throw new Error(`There's no evals/drafts/${id}.json. Make one with \`pnpm task:new <run> <task> <try>\`.`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(/*turbopackIgnore: true*/ path, "utf8"));
  } catch {
    throw new Error(`evals/drafts/${id}.json isn't valid JSON.`);
  }
  const parsed = draftSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`evals/drafts/${id}.json isn't a valid task yet:\n${z.prettifyError(parsed.error)}`);
  const { _from: from, ...task } = parsed.data;
  if (task.id !== id) throw new Error(`evals/drafts/${id}.json says its id is ${task.id}. Keep the file name and id the same.`);
  if (task.note.includes(DRAFT_MARK)) throw new Error(`evals/drafts/${id}.json still has "${DRAFT_MARK}" in its note. Say what the task checks first.`);
  if (source !== null && source.first_message === task.first_message) {
    throw new Error(`evals/drafts/${id}.json has the same first message as ${source.id}. A regression task asks in its own words, or it only repeats that task.`);
  }
  return { task, from };
}
