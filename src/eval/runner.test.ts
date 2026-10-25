import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterAll, describe, expect, it } from "vitest";
import { loadConfig } from "../config";
import { writeShop } from "../shop/seed";
import { loadAgentVersion } from "../agent/versions";
import { taskSchema, type Task } from "../tasks/schema";
import type { PendingCalls } from "./budget";
import { Pacer, type Clock } from "./pacer";
import { buildRunConfig, runFingerprint } from "./plan";
import { makeRedactor } from "./redact";
import { runTrials, STOP_AFTER_ERRORS_IN_A_ROW, type PoolProvider, type RunOutcome } from "./runner";
import { EvalStore } from "./store";
import { GRADERS } from "../graders";
import { loadShopFacts } from "../graders/shop-facts";

const dir = mkdtempSync(join(tmpdir(), "verifai-runner-test-"));
const seedPath = join(dir, "shop.db");
writeShop(seedPath);
const shop = loadShopFacts(seedPath);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const config = loadConfig();
const version = loadAgentVersion(config, "2026-03-15");

const usage = {
  inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 20, text: 20, reasoning: 0 },
};
const reply = (text: string) => ({
  content: [{ type: "text" as const, text }],
  finishReason: { unified: "stop" as const, raw: "stop" },
  usage,
  warnings: [],
});
const apiError = (statusCode: number, responseBody: string) =>
  new APICallError({ message: responseBody, url: "https://example.test", requestBodyValues: {}, statusCode, responseBody });

const task = (id: string, category: Task["category"], extra: Partial<Task["expected"]>): Task =>
  taskSchema.parse({
    id,
    split: "dev",
    category,
    difficulty: "easy",
    adversarial: false,
    note: "test",
    first_message: `Hi, about ${id}: where is order 1005?`,
    canned_replies: [],
    expected: { changes: [], ...extra },
    reference: [],
  });
// Passes when the agent says "processing"; the cancel one never passes on a reply alone.
const tasks = [
  task("status-01", "status", { facts: [{ text: ["processing"] }] }),
  task("cancel-01", "cancel", { changes: [{ op: "update", table: "orders", key: { id: 1005 }, set: { status: "cancelled" } }] }),
];

// Sleeping moves the clock on at once, so waits cost no real time.
let skipped = 0;
const clock: Clock = { now: () => Date.now() + skipped, sleep: async (ms) => void (skipped += ms) };

function planFor(useCache = true) {
  const runConfig = buildRunConfig({ config, version, datasetVersion: "v1", split: "dev", tasks, useCache, smoke: false });
  return { runConfig, fingerprint: runFingerprint(runConfig) };
}

// One mock model per provider, in pool order: Groq, then Cloudflare.
async function run(
  models: MockLanguageModelV4 | MockLanguageModelV4[],
  store: EvalStore,
  runId: string,
  opts: { useCache?: boolean; notices?: string[]; stopAfterTries?: number; dailyLimitReached?: (provider: string, pending: PendingCalls) => string | null; concurrency?: number } = {},
): Promise<{ outcome: RunOutcome; sent: number; replayed: number }> {
  const { runConfig, fingerprint } = planFor(opts.useCache);
  if (!store.getRun(runId)) store.createRun({ id: runId, createdAt: new Date().toISOString(), fingerprint, config: runConfig });
  let sent = 0;
  let replayed = 0;
  let done = 0;
  const pool: PoolProvider[] = [models].flat().map((model, i) => ({
    provider: ["groq", "cloudflare"][i],
    label: ["Groq", "Cloudflare"][i],
    model,
    pacer: new Pacer({ requestsPerMinute: 1000, tokensPerMinute: 10_000_000 }, clock),
    describeError: (e) => (e instanceof Error ? e.message : String(e)),
    dailyAfterLimitErrors: [null, 3][i],
    dailyLimitReached: (pending) => opts.dailyLimitReached?.(["groq", "cloudflare"][i], pending) ?? null,
  }));
  const outcome = await runTrials({
    store,
    runId,
    config: runConfig,
    pool,
    setup: { temperature: 0, maxSteps: 3, stepTimeoutMs: 1000, reasoningEffort: "low", version },
    tasks,
    concurrency: opts.concurrency ?? 1,
    clock,
    describeError: (e) => (e instanceof Error ? e.message : String(e)),
    tracer: null,
    stopRequested: () => opts.stopAfterTries !== undefined && done >= opts.stopAfterTries,
    onNotice: (m) => opts.notices?.push(m),
    onProgress: (p) => {
      sent = p.sentCalls;
      replayed = p.replayedCalls;
      done = p.done;
    },
    seedPath,
    shop,
  });
  return { outcome, sent, replayed };
}

const newStore = () => new EvalStore(":memory:", makeRedactor([]));

describe("runner", () => {
  it("records every try with its steps, grades and tokens", async () => {
    const store = newStore();
    const model = new MockLanguageModelV4({ doGenerate: async () => reply("Your order is processing.") });
    const { outcome, sent } = await run(model, store, "r1");
    expect(outcome).toEqual({ finished: true });
    const trials = store.loadTrials("r1");
    expect(trials).toHaveLength(tasks.length * config.runner.triesPerTask);
    expect(sent).toBe(trials.length);
    for (const t of trials) {
      expect(t.status).toBe(t.taskId === "status-01" ? "passed" : "failed");
      // Every grader is saved, step and all, and reads back the same.
      expect(t.verdicts.map((v) => v.grader)).toEqual([...GRADERS]);
      expect(t.verdicts.every((v) => "step" in v && typeof v.ungraded === "boolean")).toBe(true);
      expect(t.usage).toEqual({ inputTokens: 100, cachedInputTokens: 0, outputTokens: 20 });
      expect(t.steps.map((s) => s.type)).toEqual(["customer", "model", "text"]);
      expect(t.steps[1]).toMatchObject({ type: "model", provider: "groq" });
    }
  });

  it("replays a repeated run from the cache without sending a call, and --no-cache sends again", async () => {
    const store = newStore();
    const model = new MockLanguageModelV4({ doGenerate: async () => reply("Your order is processing.") });
    await run(model, store, "r1");
    const before = model.doGenerateCalls.length;
    const again = await run(model, store, "r2");
    expect(again).toMatchObject({ outcome: { finished: true }, sent: 0, replayed: 8 });
    expect(model.doGenerateCalls.length).toBe(before);
    expect(store.loadTrials("r2").every((t) => t.cachedCalls === t.calls)).toBe(true);

    const fresh = await run(model, store, "r3", { useCache: false });
    expect(fresh.sent).toBe(8);
  });

  it("gives each try of a task its own cache entry", async () => {
    const store = newStore();
    let n = 0;
    const model = new MockLanguageModelV4({ doGenerate: async () => reply(`Your order is processing (${++n}).`) });
    await run(model, store, "r1");
    const replies = store
      .loadTrials("r1")
      .filter((t) => t.taskId === "status-01")
      .map((t) => t.steps.find((s) => s.type === "text"));
    expect(new Set(replies.map((s) => s?.type === "text" && s.text)).size).toBe(config.runner.triesPerTask);
  });

  it("carries a stopped run on without redoing a finished try", async () => {
    const store = newStore();
    const model = new MockLanguageModelV4({ doGenerate: async () => reply("Your order is processing.") });
    const first = await run(model, store, "r1", { useCache: false, stopAfterTries: 3 });
    expect(first.outcome).toMatchObject({ finished: false, reason: "interrupted" });
    expect(store.loadTrials("r1")).toHaveLength(3);
    const second = await run(model, store, "r1", { useCache: false });
    expect(second.outcome).toEqual({ finished: true });
    expect(second.sent).toBe(5);
    expect(store.loadTrials("r1")).toHaveLength(8);
  });

  it("records an errored try as errored, never as a pass, and goes on", async () => {
    const store = newStore();
    let n = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        if (++n === 1) throw apiError(500, "internal error");
        return reply("Your order is processing.");
      },
    });
    const { outcome } = await run(model, store, "r1");
    expect(outcome).toEqual({ finished: true });
    const trials = store.loadTrials("r1");
    expect(trials).toHaveLength(8);
    const errored = trials.filter((t) => t.status === "errored");
    expect(errored).toHaveLength(1);
    expect(errored[0].error).toMatch(/internal error/);
    expect(errored[0].steps[0].type).toBe("customer");
  });

  it("stops cleanly at the daily limit and saves nothing half-done", async () => {
    const store = newStore();
    let n = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        if (++n > 2) throw apiError(429, "Rate limit reached on tokens per day (TPD): Limit 200000, Used 199990");
        return reply("Your order is processing.");
      },
    });
    const { outcome } = await run(model, store, "r1");
    expect(outcome).toMatchObject({ finished: false, reason: "daily" });
    expect(store.loadTrials("r1")).toHaveLength(2);
    expect(store.getRun("r1")?.status).toBe("running");
  });

  it("waits out a busy provider, says so, then carries on", async () => {
    const store = newStore();
    const notices: string[] = [];
    let n = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        if (++n === 1) throw apiError(503, "over capacity");
        return reply("Your order is processing.");
      },
    });
    const { outcome } = await run(model, store, "r1", { notices });
    expect(outcome).toEqual({ finished: true });
    expect(notices.some((m) => /Groq is busy.*waiting 15s, then retrying/.test(m))).toBe(true);
    expect(store.loadTrials("r1").every((t) => t.status !== "errored")).toBe(true);
  });

  it("switches to the next provider at the daily limit, records who answered, and stops when every one is used up", async () => {
    const store = newStore();
    const notices: string[] = [];
    let groqCalls = 0;
    let cloudflareCalls = 0;
    const groq = new MockLanguageModelV4({
      doGenerate: async () => {
        if (++groqCalls > 2) throw apiError(429, "Rate limit reached on tokens per day (TPD): Limit 200000, Used 199990");
        return reply("Your order is processing.");
      },
    });
    const cloudflare = new MockLanguageModelV4({
      doGenerate: async () => {
        if (++cloudflareCalls > 3) throw apiError(429, "4006: you have used up your daily free allocation of 10,000 neurons");
        return reply("Your order is processing.");
      },
    });
    const { outcome } = await run([groq, cloudflare], store, "r1", { notices });
    expect(outcome).toMatchObject({ finished: false, reason: "daily" });
    const providers = store
      .loadTrials("r1")
      .flatMap((t) => t.steps.flatMap((s) => (s.type === "model" ? [s] : [])))
      .sort((a, b) => a.startedAt - b.startedAt)
      .map((s) => s.provider);
    expect(providers).toEqual(["groq", "groq", "cloudflare", "cloudflare", "cloudflare"]);
    // Once used up, Groq isn't asked again in this command.
    expect(groqCalls).toBe(3);
    expect(notices.some((m) => /Groq's free limit for today is used up; carrying on with Cloudflare/.test(m))).toBe(true);
  });

  it("stops sending to a provider once our count says its day is used up, though it keeps answering", async () => {
    const store = newStore();
    const notices: string[] = [];
    let cloudflareCalls = 0;
    const groq = new MockLanguageModelV4({ doGenerate: async () => reply("Your order is processing.") });
    const cloudflare = new MockLanguageModelV4({
      doGenerate: async () => {
        cloudflareCalls++;
        return reply("Your order is processing.");
      },
    });
    const { outcome } = await run([groq, cloudflare], store, "r1", {
      notices,
      // Groq is used up from the start; Cloudflare after two calls.
      dailyLimitReached: (provider) => (provider === "groq" ? "all used" : cloudflareCalls >= 2 ? "10,012 of its 10,000 neurons today are used by our count" : null),
    });
    expect(outcome).toMatchObject({ finished: false, reason: "daily" });
    expect(cloudflareCalls).toBe(2);
    expect(notices).toContain("Groq's free limit for today is used up: all used; carrying on with Cloudflare.");
    expect(notices).toContain("Cloudflare's free limit for today is used up: 10,012 of its 10,000 neurons today are used by our count.");
  });

  it("counts calls still in flight against the allowance, so tries side by side can't pass it", async () => {
    const store = newStore();
    let sentToCloudflare = 0;
    let answered = 0;
    const groq = new MockLanguageModelV4({ doGenerate: async () => reply("Your order is processing.") });
    const cloudflare = new MockLanguageModelV4({
      doGenerate: async () => {
        sentToCloudflare++;
        await new Promise((r) => setTimeout(r, 5));
        answered++;
        return reply("Your order is processing.");
      },
    });
    // Room for three calls in all, and two tries running at once.
    const { outcome } = await run([groq, cloudflare], store, "r1", {
      concurrency: 2,
      dailyLimitReached: (provider, pending) => (provider === "groq" || answered + pending.calls > 3 ? "used up" : null),
    });
    expect(outcome).toMatchObject({ finished: false, reason: "daily" });
    expect(sentToCloudflare).toBe(3);
  });

  it("counts three limit errors in a row from Cloudflare as its day used up, whatever they say", async () => {
    const store = newStore();
    const notices: string[] = [];
    // Groq waits out a long per-minute limit at first, so Cloudflare is asked.
    let groqCalls = 0;
    const groq = new MockLanguageModelV4({
      doGenerate: async () => {
        if (++groqCalls === 1) throw apiError(429, "Rate limit reached on tokens per minute (TPM). Please try again in 1m29s.");
        return reply("Your order is processing.");
      },
    });
    const cloudflare = new MockLanguageModelV4({
      doGenerate: async () => {
        throw apiError(429, "Too many requests");
      },
    });
    const { outcome } = await run([groq, cloudflare], store, "r1", { notices });
    expect(outcome).toEqual({ finished: true });
    expect(cloudflare.doGenerateCalls).toHaveLength(3);
    expect(notices.filter((m) => /Cloudflare refused 3 calls in a row with a limit error.*carrying on with Groq/.test(m))).toHaveLength(1);
    const providers = store.loadTrials("r1").flatMap((t) => t.steps.flatMap((s) => (s.type === "model" ? [s.provider] : [])));
    expect(new Set(providers)).toEqual(new Set(["groq"]));
  });

  it("doesn't count Groq's per-minute limit errors towards its day", async () => {
    const store = newStore();
    let n = 0;
    const groq = new MockLanguageModelV4({
      doGenerate: async () => {
        if (++n <= 3) throw apiError(429, "Rate limit reached on tokens per minute (TPM). Please try again in 2s.");
        return reply("Your order is processing.");
      },
    });
    const { outcome } = await run(groq, store, "r1");
    expect(outcome).toEqual({ finished: true });
  });

  it("sends the next call to the next provider when one is rate limiting", async () => {
    const store = newStore();
    const notices: string[] = [];
    let n = 0;
    const groq = new MockLanguageModelV4({
      doGenerate: async () => {
        if (++n === 1) throw apiError(429, "Rate limit reached on tokens per minute (TPM). Please try again in 20s.");
        return reply("Your order is processing.");
      },
    });
    const cloudflare = new MockLanguageModelV4({ doGenerate: async () => reply("Your order is processing.") });
    const { outcome } = await run([groq, cloudflare], store, "r1", { notices });
    expect(outcome).toEqual({ finished: true });
    expect(notices.some((m) => /Groq is busy or rate limiting; sending to Cloudflare instead/.test(m))).toBe(true);
    const first = store.loadTrials("r1").find((t) => t.taskId === "status-01" && t.tryNumber === 1);
    expect(first?.steps[1]).toMatchObject({ type: "model", provider: "cloudflare" });
  });

  it("replays a cached answer whichever provider gave it, and keeps who that was", async () => {
    const store = newStore();
    const usedUp = new MockLanguageModelV4({
      doGenerate: async () => {
        throw apiError(429, "Rate limit reached on requests per day (RPD)");
      },
    });
    const cloudflare = new MockLanguageModelV4({ doGenerate: async () => reply("Your order is processing.") });
    await run([usedUp, cloudflare], store, "r1");
    const groq = new MockLanguageModelV4({ doGenerate: async () => reply("Your order is processing.") });
    const again = await run(groq, store, "r2");
    expect(again).toMatchObject({ sent: 0, replayed: 8 });
    expect(groq.doGenerateCalls).toHaveLength(0);
    expect(store.loadTrials("r2")[0].steps[1]).toMatchObject({ type: "model", provider: "cloudflare", cached: true });
  });

  it(`stops after ${STOP_AFTER_ERRORS_IN_A_ROW} errored tries in a row`, async () => {
    const store = newStore();
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw apiError(500, "internal error");
      },
    });
    const { outcome } = await run(model, store, "r1");
    expect(outcome).toMatchObject({ finished: false, reason: "errors" });
    expect(store.loadTrials("r1")).toHaveLength(STOP_AFTER_ERRORS_IN_A_ROW);
  });
});
