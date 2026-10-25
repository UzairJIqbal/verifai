// Turns text into vectors for two jobs: picking exemplars like the task at
// hand, and spotting a new task that repeats an old one. Every vector is
// cached in the eval store by model, size and text, so asking twice is free.
import { createHash } from "node:crypto";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embedMany } from "ai";
import { z } from "zod";
import { canonical } from "../canonical";
import { readOptionalEnv, requireApiKey, type ApiKeySource, type EmbeddingConfig } from "../config";

export type EmbeddingCache = {
  cacheGet: (key: string) => string | null;
  cachePut: (key: string, json: string, at: string) => void;
};

// Sends texts to the model and gets one vector back for each, in order.
export type SendEmbeddings = (texts: string[]) => Promise<number[][]>;

const KEYS: Record<EmbeddingConfig["provider"], ApiKeySource> = {
  gemini: { env: "GOOGLE_GENERATIVE_AI_API_KEY", getKeyAt: "https://aistudio.google.com/apikey" },
};

export type Embedder = { label: string; secrets: string[]; send: SendEmbeddings };

// Throws, before any call, if the key is missing.
export function connectEmbedder(embedding: EmbeddingConfig): Embedder {
  const key = requireApiKey(KEYS[embedding.provider]);
  const model = createGoogleGenerativeAI({ apiKey: key }).embedding(embedding.model);
  return {
    label: `Gemini ${embedding.model}`,
    secrets: [key],
    send: async (texts) => {
      const { embeddings } = await embedMany({
        model,
        values: texts,
        // Similar meaning, not search: both uses compare like with like.
        providerOptions: { google: { outputDimensionality: embedding.dimensions, taskType: "SEMANTIC_SIMILARITY" } },
      });
      return embeddings;
    },
  };
}

// The key as it is in .env.local, without connecting, for the redactor.
export const embeddingSecrets = (embedding: EmbeddingConfig): (string | undefined)[] => [readOptionalEnv(KEYS[embedding.provider].env)];

export const embeddingKey = (embedding: EmbeddingConfig, text: string): string =>
  createHash("sha256").update(canonical({ embedding: { model: embedding.model, dimensions: embedding.dimensions }, text })).digest("hex");

const vectorSchema = z.array(z.number());

export function cachedEmbedding(cache: EmbeddingCache, embedding: EmbeddingConfig, text: string): number[] | null {
  const json = cache.cacheGet(embeddingKey(embedding, text));
  if (json === null) return null;
  const parsed = vectorSchema.safeParse(JSON.parse(json));
  return parsed.success && parsed.data.length === embedding.dimensions ? parsed.data : null;
}

// The distinct texts the cache can't answer: what a run would send.
export function uncachedTexts(cache: EmbeddingCache, embedding: EmbeddingConfig, texts: string[]): string[] {
  return [...new Set(texts)].filter((t) => cachedEmbedding(cache, embedding, t) === null);
}

// Vectors for every text, in order. Only the ones not cached are sent, in one
// call. A vector of the wrong size is a loud error, never a silent zero.
export async function embedTexts(cache: EmbeddingCache, embedding: EmbeddingConfig, texts: string[], send: SendEmbeddings, now: () => Date = () => new Date()): Promise<number[][]> {
  const missing = uncachedTexts(cache, embedding, texts);
  if (missing.length > 0) {
    const vectors = await send(missing);
    if (vectors.length !== missing.length) throw new Error(`Asked for ${missing.length} embeddings and got ${vectors.length}.`);
    vectors.forEach((v, i) => {
      if (v.length !== embedding.dimensions) throw new Error(`An embedding came back with ${v.length} numbers, not the ${embedding.dimensions} in the config.`);
      cache.cachePut(embeddingKey(embedding, missing[i]), JSON.stringify(v), now().toISOString());
    });
  }
  return texts.map((t) => {
    const v = cachedEmbedding(cache, embedding, t);
    if (v === null) throw new Error("An embedding went missing from the cache right after it was saved.");
    return v;
  });
}

// 1 is the same direction, 0 unrelated.
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error(`Can't compare vectors of ${a.length} and ${b.length} numbers.`);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

// The k most similar, most similar first; ties go to the earlier id so the
// same inputs always give the same pick.
export function nearest<T extends { id: string; vector: number[] }>(query: number[], items: T[], k: number): { item: T; similarity: number }[] {
  return items
    .map((item) => ({ item, similarity: cosine(query, item.vector) }))
    .sort((x, y) => y.similarity - x.similarity || x.item.id.localeCompare(y.item.id))
    .slice(0, k);
}
