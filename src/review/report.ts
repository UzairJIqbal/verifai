// The taxonomy report: each category's count and share of the tagged notes,
// with two example tries, and which category to fix first. Pure: notes,
// tags and the taxonomy in, numbers out.
import { bootstrapRatio, type Estimate } from "../stats/stats";
import { byReviewOrder } from "./order";
import { TASK_WRONG, trialKey, type FailureCategory, type Note, type Tag, type Taxonomy } from "./schema";

export type CategoryRow = FailureCategory & {
  count: number;
  tasks: number;
  // Of every tagged note, with a 95% interval resampled by task.
  share: Estimate;
  // Two at most, from different tasks where there are two.
  examples: Note[];
  // False for "the task was wrong": the agent was right.
  agentFailure: boolean;
};

export type TaxonomyReport = {
  notes: number;
  // Notes a model drafted rather than a person wrote.
  drafted: number;
  tasks: number;
  tagged: number;
  // Notes with no tag, or whose newest tag names a category the taxonomy
  // no longer has. Either way they count nowhere until tagged.
  untagged: Note[];
  stale: number;
  rows: CategoryRow[];
  // The most common agent failure, and whether its lead over the next one is
  // bigger than the noise: their share intervals don't overlap.
  top: { row: CategoryRow; next: CategoryRow | null; clear: boolean } | null;
};

const byTaskId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// The newest tag for each note.
export function latestTags(tags: Tag[]): Map<string, Tag> {
  const out = new Map<string, Tag>();
  for (const t of tags) {
    const seen = out.get(trialKey(t));
    if (!seen || seen.taggedAt <= t.taggedAt) out.set(trialKey(t), t);
  }
  return out;
}

function examples(notes: Note[]): Note[] {
  const ordered = [...notes].sort(byReviewOrder);
  const first = ordered[0];
  if (!first) return [];
  const other = ordered.find((n) => n.taskId !== first.taskId) ?? ordered[1];
  return other ? [first, other] : [first];
}

export function taxonomyReport(notes: Note[], tags: Tag[], taxonomy: Taxonomy): TaxonomyReport {
  const ids = new Set(taxonomy.categories.map((c) => c.id));
  const latest = latestTags(tags);
  const tagged: { note: Note; category: string }[] = [];
  const untagged: Note[] = [];
  let stale = 0;
  for (const note of notes) {
    const tag = latest.get(trialKey(note));
    if (tag && ids.has(tag.category)) tagged.push({ note, category: tag.category });
    else {
      if (tag) stale++;
      untagged.push(note);
    }
  }

  const taskIds = [...new Set(tagged.map((t) => t.note.taskId))].sort(byTaskId);
  const rows: CategoryRow[] = taxonomy.categories.map((c) => {
    const mine = tagged.filter((t) => t.category === c.id).map((t) => t.note);
    // Per task: its notes in this category over all its tagged notes. Tries
    // of one task fail alike, so tasks are what get resampled.
    const parts = taskIds.map((id) => ({ hits: mine.filter((n) => n.taskId === id).length, chances: tagged.filter((t) => t.note.taskId === id).length }));
    return { ...c, count: mine.length, tasks: new Set(mine.map((n) => n.taskId)).size, share: bootstrapRatio(parts), examples: examples(mine), agentFailure: c.id !== TASK_WRONG };
  });
  // By count; a tie keeps the taxonomy's order.
  rows.sort((a, b) => b.count - a.count);

  const agent = rows.filter((r) => r.agentFailure && r.count > 0);
  const [first, second] = agent;
  const top = first ? { row: first, next: second ?? null, clear: second === undefined || first.share.lo > second.share.hi } : null;

  return { notes: notes.length, drafted: notes.filter((n) => n.draftedBy === "model").length, tasks: new Set(notes.map((n) => n.taskId)).size, tagged: tagged.length, untagged, stale, rows, top };
}
