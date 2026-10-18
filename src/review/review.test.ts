import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { trialSchema } from "../results/schema";
import { taxonomyDoc } from "./doc";
import { readNotes, readTags, readTaxonomy, type ReviewFiles } from "./files";
import { nextToReview, type ReviewPool } from "./pick";
import { taxonomyReport } from "./report";
import { saveNote, saveTag } from "./save";
import { TASK_WRONG, taxonomySchema, type Note, type Tag, type Taxonomy } from "./schema";

const TAXONOMY: Taxonomy = {
  writtenAt: "2026-10-19",
  categories: [
    { id: "wrong-tool", name: "Wrong tool", definition: "Called a tool that doesn't do what the customer asked." },
    { id: "skipped-lookup", name: "Skipped look-up", definition: "Acted or answered without reading the record first." },
    { id: "policy-break", name: "Policy break", definition: "Did something the policy forbids." },
    { id: "gave-up", name: "Gave up early", definition: "Stopped before the task was done." },
    { id: TASK_WRONG, name: "The task was wrong", definition: "The agent was right; the task's expected state wasn't." },
  ],
};

const note = (taskId: string, tryNumber = 1, runId = "r1"): Note => ({ runId, taskId, tryNumber, taskCategory: "cancel", datasetVersion: "v1", note: `note on ${taskId}`, notedAt: "2026-10-19T00:00:00.000Z" });
const tag = (n: Note, category: string, taggedAt = "2026-10-19T01:00:00.000Z"): Tag => ({ runId: n.runId, taskId: n.taskId, tryNumber: n.tryNumber, category, taggedAt });

describe("taxonomySchema", () => {
  it("needs 5 to 10 categories, unique ids, and the task-was-wrong one", () => {
    expect(taxonomySchema.safeParse(TAXONOMY).success).toBe(true);
    expect(taxonomySchema.safeParse({ ...TAXONOMY, categories: TAXONOMY.categories.slice(0, 4) }).success).toBe(false);
    expect(taxonomySchema.safeParse({ ...TAXONOMY, categories: TAXONOMY.categories.map((c) => (c.id === TASK_WRONG ? { ...c, id: "other" } : c)) }).success).toBe(false);
    expect(taxonomySchema.safeParse({ ...TAXONOMY, categories: [...TAXONOMY.categories, TAXONOMY.categories[0]] }).success).toBe(false);
  });
});

describe("taxonomyReport", () => {
  const a1 = note("cancel-01");
  const a2 = note("cancel-01", 2);
  const b1 = note("refund-01");
  const c1 = note("status-01");
  const d1 = note("address-01");

  it("counts the newest tag, sorts by count and leaves untagged and stale notes out", () => {
    const tags = [tag(a1, "gave-up"), tag(a1, "wrong-tool", "2026-10-19T02:00:00.000Z"), tag(a2, "wrong-tool"), tag(b1, "policy-break"), tag(c1, "renamed-away")];
    const r = taxonomyReport([a1, a2, b1, c1, d1], tags, TAXONOMY);
    expect(r).toMatchObject({ notes: 5, tagged: 3, stale: 1 });
    expect(r.untagged.map((n) => n.taskId).sort()).toEqual(["address-01", "status-01"]);
    expect(r.rows.map((x) => [x.id, x.count])).toEqual([
      ["wrong-tool", 2],
      ["policy-break", 1],
      ["skipped-lookup", 0],
      ["gave-up", 0],
      [TASK_WRONG, 0],
    ]);
    const top = r.rows[0];
    expect(top).toMatchObject({ tasks: 1 });
    expect(top.share.value).toBeCloseTo(2 / 3);
    expect(top.share.lo).toBeLessThanOrEqual(top.share.value);
  });

  it("never picks the task-was-wrong category as the one to fix", () => {
    const notes = [a1, a2, b1];
    const r = taxonomyReport(notes, [tag(a1, TASK_WRONG), tag(a2, TASK_WRONG), tag(b1, "gave-up")], TAXONOMY);
    expect(r.rows[0].id).toBe(TASK_WRONG);
    expect(r.top?.row.id).toBe("gave-up");
    expect(r.top?.next).toBeNull();
  });

  it("says when the lead is inside the noise", () => {
    const r = taxonomyReport([a1, b1, c1], [tag(a1, "wrong-tool"), tag(b1, "wrong-tool"), tag(c1, "gave-up")], TAXONOMY);
    expect(r.top?.row.id).toBe("wrong-tool");
    expect(r.top?.clear).toBe(false);
  });

  it("takes examples from two different tasks when it can", () => {
    const notes = [a1, a2, b1];
    const r = taxonomyReport(notes, notes.map((n) => tag(n, "wrong-tool")), TAXONOMY);
    const ex = r.rows[0].examples;
    expect(ex).toHaveLength(2);
    expect(new Set(ex.map((n) => n.taskId)).size).toBe(2);
  });

  it("writes the same doc for the same notes", () => {
    const notes = [a1, b1];
    const report = taxonomyReport(notes, [tag(a1, "wrong-tool"), tag(b1, "gave-up")], TAXONOMY);
    const doc = taxonomyDoc({ report, taxonomy: TAXONOMY });
    expect(doc).toBe(taxonomyDoc({ report: taxonomyReport(notes, [tag(a1, "wrong-tool"), tag(b1, "gave-up")], TAXONOMY), taxonomy: TAXONOMY }));
    expect(doc).toContain("| Wrong tool | 1 | 1 |");
    expect(doc).toContain("/runs/r1/cancel-01/1");
    expect(doc).not.toContain("drafted by a model");
  });

  it("says how many notes a model drafted", () => {
    const notes = [{ ...a1, draftedBy: "model" as const }, b1];
    const report = taxonomyReport(notes, [tag(a1, "wrong-tool"), tag(b1, "gave-up")], TAXONOMY);
    expect(report.drafted).toBe(1);
    expect(taxonomyDoc({ report, taxonomy: TAXONOMY })).toContain("**1 of the 2 notes, and their categories, were drafted by a model (Claude)");
  });
});

describe("saving", () => {
  const files = (): ReviewFiles => {
    const dir = mkdtempSync(join(tmpdir(), "verifai-review-"));
    return { notes: join(dir, "notes.jsonl"), tags: join(dir, "tags.jsonl"), taxonomy: join(dir, "taxonomy.json") };
  };
  const usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
  const trial = (taskId: string, tryNumber: number) =>
    trialSchema.parse({
      taskId, tryNumber, category: "cancel", difficulty: "easy", status: "failed", end: "answered", error: null, verdicts: [], calls: 0, cachedCalls: 0,
      usage, costUsd: 0, modelLatencyMs: 0, startedAt: "t", finishedAt: "t", traceUrl: null, steps: [],
    });
  const pool: ReviewPool = {
    trials: [
      { runId: "r1", taskId: "cancel-01", tryNumber: 1, datasetVersion: "v1", trial: trial("cancel-01", 1) },
      { runId: "r1", taskId: "refund-01", tryNumber: 1, datasetVersion: "v1", trial: trial("refund-01", 1) },
    ],
    problems: [],
  };
  const now = new Date("2026-10-19T00:00:00.000Z");
  const body = (taskId: string, category: string | null = null) => ({ runId: "r1", taskId, tryNumber: 1, note: "Cancelled without asking.", category });

  it("takes only the try offered next, then moves on", () => {
    const f = files();
    expect(saveNote(body("refund-01"), now, f, pool)).toMatchObject({ ok: false, status: 409 });
    expect(saveNote(body("cancel-01"), now, f, pool)).toEqual({ ok: true });
    expect(saveNote(body("cancel-01"), now, f, pool)).toMatchObject({ ok: false, status: 409 });
    expect(nextToReview(pool, readNotes(f))?.taskId).toBe("refund-01");
    expect(readNotes(f)[0].draftedBy).toBeUndefined();
    expect(saveNote({ ...body("refund-01"), draftedBy: "model" }, now, f, pool)).toEqual({ ok: true });
    expect(readNotes(f)[1].draftedBy).toBe("model");
  });

  it("refuses a category before the taxonomy exists and needs one after", () => {
    const f = files();
    expect(saveNote(body("cancel-01", "wrong-tool"), now, f, pool)).toMatchObject({ ok: false, status: 400 });
    writeFileSync(f.taxonomy, JSON.stringify(TAXONOMY));
    expect(readTaxonomy(f)?.categories).toHaveLength(5);
    expect(saveNote(body("cancel-01"), now, f, pool)).toMatchObject({ ok: false, status: 400 });
    expect(saveNote(body("cancel-01", "made-up"), now, f, pool)).toMatchObject({ ok: false, status: 400 });
    expect(saveNote(body("cancel-01", "wrong-tool"), now, f, pool)).toEqual({ ok: true });
    expect(readTags(readNotes(f), f).map((t) => t.category)).toEqual(["wrong-tool"]);
  });

  it("tags a note written before the taxonomy, and only a note that exists", () => {
    const f = files();
    saveNote(body("cancel-01"), now, f, pool);
    writeFileSync(f.taxonomy, JSON.stringify(TAXONOMY));
    expect(saveTag({ runId: "r1", taskId: "refund-01", tryNumber: 1, category: "gave-up" }, now, f)).toMatchObject({ ok: false, status: 404 });
    expect(saveTag({ runId: "r1", taskId: "cancel-01", tryNumber: 1, category: "gave-up" }, now, f)).toEqual({ ok: true });
    expect(taxonomyReport(readNotes(f), readTags(readNotes(f), f), TAXONOMY).untagged).toHaveLength(0);
  });
});
