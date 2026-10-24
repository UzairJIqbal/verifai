// results/online/<batch>/: one folder per traffic batch, the only thing the
// online page reads. The conversations go first and batch.json last, so a
// folder with a batch.json is a whole batch.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { PROJECT_ROOT } from "../config";
import type { Redact } from "../eval/redact";
import { batchSchema, conversationSchema, ONLINE_FILES, type Batch, type Conversation } from "./schema";

export const ONLINE_DIR_NAME = "online";
export const ONLINE_DIR = join(PROJECT_ROOT, "results", ONLINE_DIR_NAME);
const BATCH_ID = /^[A-Za-z0-9_-]+$/;

export function writeBatch(batch: Batch, conversations: Conversation[], redact: Redact, dir: string = ONLINE_DIR): string {
  const batchDir = join(dir, batch.batchId);
  mkdirSync(/*turbopackIgnore: true*/ batchDir, { recursive: true });
  // Parsed on the way out too: a shape the page can't read never gets written.
  const lines = [...conversations].sort((a, b) => a.number - b.number).map((c) => JSON.stringify(conversationSchema.parse(c)));
  writeFileSync(/*turbopackIgnore: true*/ join(batchDir, ONLINE_FILES.conversations), redact(lines.length === 0 ? "" : `${lines.join("\n")}\n`));
  const tmp = join(batchDir, `${ONLINE_FILES.batch}.tmp`);
  writeFileSync(/*turbopackIgnore: true*/ tmp, redact(`${JSON.stringify(batchSchema.parse(batch), null, 2)}\n`));
  renameSync(/*turbopackIgnore: true*/ tmp, join(batchDir, ONLINE_FILES.batch));
  return batchDir;
}

function readJson(path: string, label: string): unknown {
  try {
    return JSON.parse(readFileSync(/*turbopackIgnore: true*/ path, "utf8"));
  } catch (error) {
    throw new Error(`${label} isn't readable JSON (${error instanceof Error ? error.message : String(error)}).`);
  }
}

function readBatchFile(batchId: string, dir: string): Batch {
  const label = `results/${ONLINE_DIR_NAME}/${batchId}/${ONLINE_FILES.batch}`;
  const parsed = batchSchema.safeParse(readJson(join(dir, batchId, ONLINE_FILES.batch), label));
  if (!parsed.success) throw new Error(`${label} doesn't match the expected shape:\n${z.prettifyError(parsed.error)}`);
  if (parsed.data.batchId !== batchId) throw new Error(`${label} says it's batch ${parsed.data.batchId}.`);
  return parsed.data;
}

export type BatchListing = { batches: Batch[]; problems: string[] };

// Oldest first: the order the page plots them in. A folder without a
// batch.json is a batch still being written, and is left out.
export function listBatches(dir: string = ONLINE_DIR): BatchListing {
  if (!existsSync(/*turbopackIgnore: true*/ dir)) return { batches: [], problems: [] };
  const batches: Batch[] = [];
  const problems: string[] = [];
  for (const entry of readdirSync(/*turbopackIgnore: true*/ dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !BATCH_ID.test(entry.name) || !existsSync(/*turbopackIgnore: true*/ join(dir, entry.name, ONLINE_FILES.batch))) continue;
    try {
      batches.push(readBatchFile(entry.name, dir));
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  batches.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.batchId.localeCompare(b.batchId)));
  return { batches, problems };
}

export type BatchFiles = { batch: Batch; conversations: Conversation[] };

// Null when there's no such batch.
export function readBatch(batchId: string, dir: string = ONLINE_DIR): BatchFiles | null {
  if (!BATCH_ID.test(batchId) || !existsSync(/*turbopackIgnore: true*/ join(dir, batchId, ONLINE_FILES.batch))) return null;
  const batch = readBatchFile(batchId, dir);
  const label = `results/${ONLINE_DIR_NAME}/${batchId}/${ONLINE_FILES.conversations}`;
  const path = join(dir, batchId, ONLINE_FILES.conversations);
  if (!existsSync(/*turbopackIgnore: true*/ path)) throw new Error(`${label} is missing.`);
  const conversations = readFileSync(/*turbopackIgnore: true*/ path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line, i) => {
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch {
        throw new Error(`${label} line ${i + 1} isn't valid JSON.`);
      }
      const parsed = conversationSchema.safeParse(raw);
      if (!parsed.success) throw new Error(`${label} line ${i + 1} doesn't match the expected shape:\n${z.prettifyError(parsed.error)}`);
      return parsed.data;
    });
  return { batch, conversations };
}
