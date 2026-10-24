// What the files under evals/review/ keep, and what the review page and its
// routes send each other. Browser-safe: no Node modules here.
import { z } from "zod";
import { CATEGORIES } from "../tasks/schema";

const trialRef = { runId: z.string().min(1), taskId: z.string().min(1), tryNumber: z.number().int().positive() };
export type TrialRef = { runId: string; taskId: string; tryNumber: number };
export const trialKey = (t: TrialRef): string => `${t.runId}/${t.taskId}/${t.tryNumber}`;

// One failed dev try you read: one line of notes.jsonl. What went wrong in
// your words, written before (or without) any category. `datasetVersion` is
// the run's, so a task fixed later can be told apart from the one you read.
export const noteSchema = z.object({
  ...trialRef,
  taskCategory: z.enum(CATEGORIES),
  datasetVersion: z.string().min(1),
  note: z.string().trim().min(1),
  notedAt: z.string().min(1),
  // Set when a model (Claude) wrote the note and its category from the
  // trajectory instead of a person, as with Phase 9's drafted labels. Kept so
  // the report can say so.
  draftedBy: z.literal("model").optional(),
  // A flagged online conversation rather than a failed try: runId is its
  // batch, taskId the dev task its goal came from, tryNumber its number.
  online: z.literal(true).optional(),
});
export type Note = z.infer<typeof noteSchema>;

// One category given to one note: one line of tags.jsonl. Tags are only ever
// added; the newest line for a note is its category, so retagging keeps the
// history.
export const tagSchema = z.object({ ...trialRef, category: z.string().min(1), taggedAt: z.string().min(1) });
export type Tag = z.infer<typeof tagSchema>;

// "The task was wrong" always exists, under this id: when the agent was right
// and the task's expected state wasn't, it isn't an agent failure, and the
// report counts it apart.
export const TASK_WRONG = "task-wrong";

const categorySchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, "an id is lowercase words joined by hyphens, like wrong-tool"),
  name: z.string().trim().min(1),
  definition: z.string().trim().min(1),
});
export type FailureCategory = z.infer<typeof categorySchema>;

// The taxonomy you write after the first 50 or so notes: 5–10 categories.
export const taxonomySchema = z
  .object({ writtenAt: z.string().min(1), categories: z.array(categorySchema).min(5).max(10) })
  .superRefine((t, ctx) => {
    const ids = t.categories.map((c) => c.id);
    const twice = ids.find((id, i) => ids.indexOf(id) !== i);
    if (twice) ctx.addIssue({ code: "custom", message: `the id ${twice} is used twice` });
    if (!ids.includes(TASK_WRONG)) ctx.addIssue({ code: "custom", message: `one category must have the id "${TASK_WRONG}": the task was wrong, not the agent` });
  });
export type Taxonomy = z.infer<typeof taxonomySchema>;

export const saveNoteRequestSchema = z.object({
  ...trialRef,
  note: z.string().trim().min(1),
  // Required once the taxonomy exists; before that there's nothing to pick.
  category: z.string().min(1).nullable(),
  draftedBy: z.literal("model").optional(),
});
export type SaveNoteRequest = z.infer<typeof saveNoteRequestSchema>;

export const saveTagRequestSchema = z.object({ ...trialRef, category: z.string().min(1) });
export type SaveTagRequest = z.infer<typeof saveTagRequestSchema>;

export const savedResponseSchema = z.object({ ok: z.literal(true) });
