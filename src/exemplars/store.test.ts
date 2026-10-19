import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkExemplarsFit, exemplarBlock, exemplarStoreHash, pickExemplars, readExemplars, type Exemplar } from "./store";

const dir = mkdtempSync(join(tmpdir(), "verifai-exemplars-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const entry = (taskId: string, embedding: number[]): Exemplar => ({
  taskId,
  runId: "r",
  tryNumber: 1,
  datasetVersion: "v2",
  promptVersion: "v1",
  toolDescriptionsVersion: "v1",
  firstMessage: `message for ${taskId}`,
  embeddingModel: "m",
  embedding,
  transcript: [`Customer: hi from ${taskId}`],
  addedAt: "2026-10-19T00:00:00.000Z",
});

describe("exemplar memory", () => {
  it("refuses a store with any task that isn't dev", () => {
    const path = join(dir, "exemplars.jsonl");
    writeFileSync(path, [entry("refund-01", [1, 0]), entry("refund-09", [0, 1])].map((e) => JSON.stringify(e)).join("\n"));
    expect(readExemplars(new Set(["refund-01", "refund-09"]), path)).toHaveLength(2);
    // refund-09 is holdout: not among the dev ids the loader hands out.
    expect(() => readExemplars(new Set(["refund-01"]), path)).toThrow(/refund-09, which isn't a dev task/);
  });

  it("picks the two most similar, never the task's own", () => {
    const entries = [entry("a-01", [1, 0]), entry("b-01", [0.9, 0.1]), entry("c-01", [0, 1]), entry("d-01", [0.8, 0.2])];
    expect(pickExemplars({ id: "a-01" }, [1, 0], entries).map((e) => e.taskId)).toEqual(["b-01", "d-01"]);
  });

  it("adds nothing to the prompt when there's nothing to show", () => {
    expect(exemplarBlock([])).toBe("");
    expect(exemplarBlock([entry("a-01", [1, 0])])).toContain("Customer: hi from a-01");
  });

  it("counts an entry's content in the store's identity", () => {
    const a = entry("a-01", [1, 0]);
    expect(exemplarStoreHash([{ ...a, transcript: ["Customer: edited"] }])).not.toBe(exemplarStoreHash([a]));
    expect(exemplarStoreHash([{ ...a, embedding: [0, 1] }])).not.toBe(exemplarStoreHash([a]));
    expect(exemplarStoreHash([{ ...a, addedAt: "2026-10-20T00:00:00.000Z" }])).toBe(exemplarStoreHash([a]));
  });

  it("refuses entries from another embedding model or size, naming them", () => {
    const entries = [entry("a-01", [1, 0]), { ...entry("b-01", [1, 0]), embeddingModel: "other" }, entry("c-01", [1, 0, 0])];
    expect(() => checkExemplarsFit(entries.slice(0, 1), { model: "m", dimensions: 2 })).not.toThrow();
    expect(() => checkExemplarsFit(entries, { model: "m", dimensions: 2 })).toThrow(/b-01 \(other, 2 numbers\), c-01 \(m, 3 numbers\)/);
  });
});
