import { describe, expect, it } from "vitest";
import type { EmbeddingConfig } from "../config";
import { cosine, embedTexts, nearest, uncachedTexts, type EmbeddingCache } from "./embed";

const embedding: EmbeddingConfig = { provider: "gemini", model: "m", dimensions: 2, nearDuplicateSimilarity: 0.9 };
const memoryCache = (): EmbeddingCache & { size: () => number } => {
  const m = new Map<string, string>();
  return { cacheGet: (k) => m.get(k) ?? null, cachePut: (k, v) => void m.set(k, v), size: () => m.size };
};

describe("embeddings", () => {
  it("sends only the texts not cached, once each, in one call", async () => {
    const cache = memoryCache();
    const sent: string[][] = [];
    const send = async (texts: string[]) => (sent.push(texts), texts.map((t) => [t.length, 1]));
    await embedTexts(cache, embedding, ["a", "bb"], send);
    const out = await embedTexts(cache, embedding, ["bb", "ccc", "ccc", "a"], send);
    expect(sent).toEqual([["a", "bb"], ["ccc"]]);
    expect(out).toEqual([[2, 1], [3, 1], [3, 1], [1, 1]]);
    expect(uncachedTexts(cache, embedding, ["a", "dddd"])).toEqual(["dddd"]);
  });

  it("fails loudly on a vector of the wrong size", async () => {
    await expect(embedTexts(memoryCache(), embedding, ["a"], async () => [[1, 2, 3]])).rejects.toThrow(/3 numbers, not the 2/);
  });

  it("measures direction, and picks the nearest with ties to the earlier id", () => {
    expect(cosine([1, 0], [2, 0])).toBeCloseTo(1, 12);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    const items = [{ id: "b", vector: [1, 0] }, { id: "a", vector: [1, 0] }, { id: "c", vector: [0, 1] }];
    expect(nearest([1, 0], items, 2).map((n) => n.item.id)).toEqual(["a", "b"]);
  });
});
