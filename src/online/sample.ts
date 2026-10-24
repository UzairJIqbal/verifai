// Which conversations a batch makes and which of them are graded. Seeded from
// the batch id, so the same batch always means the same picks.
import { seededRandom } from "../stats/stats";
import type { Task } from "../tasks/schema";
import { PERSONAS, type Persona } from "./schema";

// FNV-1a: a small fixed hash from text to a 32-bit seed.
export function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type PlannedConversation = { number: number; template: Task; persona: Persona };

// Each conversation draws a dev task and a persona. Templates are sorted by id
// first, so the order of the tasks file can't change the picks.
export function planBatch(batchId: string, templates: Task[], count: number): PlannedConversation[] {
  if (templates.length === 0) throw new Error("There are no dev tasks to take customer goals from.");
  // Online traffic is dev-side data: a holdout task never becomes a goal.
  const holdout = templates.find((t) => t.split !== "dev");
  if (holdout) throw new Error(`Task ${holdout.id} is a holdout task; online traffic takes goals from dev tasks only.`);
  const sorted = [...templates].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const random = seededRandom(seedOf(`${batchId}:plan`));
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    template: sorted[Math.floor(random() * sorted.length)],
    persona: PERSONAS[Math.floor(random() * PERSONAS.length)],
  }));
}

// How many of n are graded: the configured share, at least one.
export const sampleSize = (n: number, share: number): number => (n === 0 ? 0 : Math.min(n, Math.max(1, Math.round(n * share))));

// An exact count picked by a seeded shuffle, rather than a coin flip each, so
// a batch never ends up with nothing graded by bad luck.
export function pickSample(batchId: string, numbers: number[], share: number): Set<number> {
  const pool = [...numbers].sort((a, b) => a - b);
  const random = seededRandom(seedOf(`${batchId}:sample`));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return new Set(pool.slice(0, sampleSize(pool.length, share)));
}
