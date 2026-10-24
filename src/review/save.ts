// Saving a note or a tag, for the review routes. The server decides what
// matters: a note must be for the try offered next (so tries stay random,
// not chosen), and a category must be one the taxonomy has.
import { appendNote, appendTag, readNotes, readTaxonomy, REVIEW_FILES, type ReviewFiles } from "./files";
import { nextToReview, reviewPool, type ReviewPool } from "./pick";
import { trialKey, type SaveNoteRequest, type SaveTagRequest } from "./schema";

export type SaveOutcome = { ok: true } | { ok: false; status: number; error: string };

function checkCategory(category: string | null, files: ReviewFiles): SaveOutcome {
  const taxonomy = readTaxonomy(files);
  if (taxonomy === null) {
    return category === null ? { ok: true } : { ok: false, status: 400, error: "There's no taxonomy yet, so a note can't have a category. Write evals/review/taxonomy.json first." };
  }
  if (category === null) return { ok: false, status: 400, error: "Pick the note's category: the taxonomy exists now, so every note gets one." };
  if (!taxonomy.categories.some((c) => c.id === category)) return { ok: false, status: 400, error: `The taxonomy has no category ${category}. Reload the page.` };
  return { ok: true };
}

export function saveNote(body: SaveNoteRequest, now: Date, files: ReviewFiles = REVIEW_FILES, pool: ReviewPool = reviewPool()): SaveOutcome {
  const notes = readNotes(files);
  const key = trialKey(body);
  if (notes.some((n) => trialKey(n) === key)) return { ok: false, status: 409, error: "This try already has a note. Reload the page for the next one." };
  const next = nextToReview(pool, notes);
  if (next === null || trialKey(next) !== key) return { ok: false, status: 409, error: "This isn't the try up next any more (the runs changed). Reload the page." };
  const checked = checkCategory(body.category, files);
  if (!checked.ok) return checked;

  const at = now.toISOString();
  appendNote({ runId: next.runId, taskId: next.taskId, tryNumber: next.tryNumber, taskCategory: next.trial.category, datasetVersion: next.datasetVersion, note: body.note, notedAt: at, ...(body.draftedBy ? { draftedBy: body.draftedBy } : {}), ...(next.online ? { online: true as const } : {}) }, files);
  if (body.category !== null) appendTag({ runId: next.runId, taskId: next.taskId, tryNumber: next.tryNumber, category: body.category, taggedAt: at }, files);
  return { ok: true };
}

export function saveTag(body: SaveTagRequest, now: Date, files: ReviewFiles = REVIEW_FILES): SaveOutcome {
  const notes = readNotes(files);
  if (!notes.some((n) => trialKey(n) === trialKey(body))) return { ok: false, status: 404, error: "There's no note for this try. Reload the page." };
  const checked = checkCategory(body.category, files);
  if (!checked.ok) return checked;
  appendTag({ runId: body.runId, taskId: body.taskId, tryNumber: body.tryNumber, category: body.category, taggedAt: now.toISOString() }, files);
  return { ok: true };
}
