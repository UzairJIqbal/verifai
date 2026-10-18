// The files under evals/review/: your notes, their tags and the taxonomy.
// The only code that reads or writes them. Every line is checked; a bad one
// stops whatever is reading, never skipped quietly.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { PROJECT_ROOT } from "../config";
import { noteSchema, tagSchema, taxonomySchema, trialKey, type Note, type Tag, type Taxonomy } from "./schema";

export type ReviewFiles = { notes: string; tags: string; taxonomy: string };

const DIR = join(PROJECT_ROOT, "evals", "review");
export const REVIEW_FILES: ReviewFiles = {
  notes: join(DIR, "notes.jsonl"),
  tags: join(DIR, "tags.jsonl"),
  taxonomy: join(DIR, "taxonomy.json"),
};

export const TAXONOMY_DOC = join(PROJECT_ROOT, "docs", "failure-taxonomy.md");

export const shown = (path: string) => path.replace(`${PROJECT_ROOT}/`, "");

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

function appendLine(path: string, row: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(/*turbopackIgnore: true*/ path, `${JSON.stringify(row)}\n`);
}

// Every note, checked: one per trial.
export function readNotes(files: ReviewFiles = REVIEW_FILES): Note[] {
  const notes = readLines(files.notes, noteSchema);
  const seen = new Set<string>();
  for (const n of notes) {
    const key = trialKey(n);
    if (seen.has(key)) throw new Error(`${shown(files.notes)} has two notes for ${key}. Keep one of the two lines.`);
    seen.add(key);
  }
  return notes;
}

// Every tag, checked: each one is for a trial that has a note.
export function readTags(notes: Note[], files: ReviewFiles = REVIEW_FILES): Tag[] {
  const tags = readLines(files.tags, tagSchema);
  const noted = new Set(notes.map(trialKey));
  const orphan = tags.find((t) => !noted.has(trialKey(t)));
  if (orphan) throw new Error(`${shown(files.tags)} tags ${trialKey(orphan)}, which has no note in ${shown(files.notes)}. Remove that line or restore the note.`);
  return tags;
}

// Null until you've written it.
export function readTaxonomy(files: ReviewFiles = REVIEW_FILES): Taxonomy | null {
  if (!existsSync(/*turbopackIgnore: true*/ files.taxonomy)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(/*turbopackIgnore: true*/ files.taxonomy, "utf8"));
  } catch {
    throw new Error(`${shown(files.taxonomy)} isn't valid JSON.`);
  }
  const parsed = taxonomySchema.safeParse(raw);
  if (!parsed.success) throw new Error(`${shown(files.taxonomy)} doesn't match the expected shape:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

export const appendNote = (note: Note, files: ReviewFiles = REVIEW_FILES): void => appendLine(files.notes, noteSchema.parse(note));
export const appendTag = (tag: Tag, files: ReviewFiles = REVIEW_FILES): void => appendLine(files.tags, tagSchema.parse(tag));

// What docs/failure-taxonomy.md says now, or null if it isn't written yet.
export const readTaxonomyDoc = (): string | null => (existsSync(/*turbopackIgnore: true*/ TAXONOMY_DOC) ? readFileSync(/*turbopackIgnore: true*/ TAXONOMY_DOC, "utf8") : null);
