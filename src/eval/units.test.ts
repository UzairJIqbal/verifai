import { APICallError } from "ai";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config";
import { loadAgentVersion } from "../agent/versions";
import { taskSchema } from "../tasks/schema";
import { estimateBudget } from "./budget";
import { cacheKey, decodeCachedCall, encodeCachedCall } from "./cache";
import { Pacer, type Clock } from "./pacer";
import { buildRunConfig, firstRequest, newRunId, runFingerprint } from "./plan";
import { busyWaitMs, classifyFailure } from "./provider-errors";
import { makeRedactor, REDACTED } from "./redact";
import { costUsd } from "./runner";
import { countRemaining } from "./session";
import { EvalStore, tryKey } from "./store";

const config = loadConfig();
const version = loadAgentVersion(config, "2026-03-15");
const task = taskSchema.parse({
  id: "status-01",
  split: "dev",
  category: "status",
  difficulty: "easy",
  adversarial: false,
  note: "test",
  first_message: "Where is order 1005?",
  canned_replies: [],
  expected: { changes: [] },
  reference: [],
});

describe("response cache", () => {
  const parts = { model: "m", temperature: 0, reasoningEffort: "low" as const, request: firstRequest(version, task), tryNumber: 1 };

  it("keys on the try number, the model and the temperature", () => {
    expect(cacheKey(parts)).toBe(cacheKey({ ...parts }));
    expect(cacheKey({ ...parts, tryNumber: 2 })).not.toBe(cacheKey(parts));
    expect(cacheKey({ ...parts, model: "n" })).not.toBe(cacheKey(parts));
    expect(cacheKey({ ...parts, temperature: 0.5 })).not.toBe(cacheKey(parts));
    expect(cacheKey({ ...parts, reasoningEffort: "medium" })).not.toBe(cacheKey(parts));
  });

  it("round-trips a call and treats an unreadable row as a miss", () => {
    const call = {
      result: {
        text: "hi",
        toolCalls: [],
        assistantMessages: [{ role: "assistant" as const, content: "hi" }],
        usage: { inputTokens: 3, cachedInputTokens: 0, outputTokens: 1 },
      },
      provider: "cloudflare",
      latencyMs: 42,
    };
    expect(decodeCachedCall(encodeCachedCall(call))).toEqual(call);
    expect(decodeCachedCall("not json")).toBeNull();
    expect(decodeCachedCall(JSON.stringify({ text: 1 }))).toBeNull();
  });
});

describe("pacer", () => {
  function fakeClock(): Clock & { slept: number[] } {
    let t = 0;
    const slept: number[] = [];
    return { now: () => t, sleep: async (ms) => void (slept.push(ms), (t += ms)), slept };
  }

  it("waits once the per-minute requests are used", async () => {
    const clock = fakeClock();
    const pacer = new Pacer({ requestsPerMinute: 3, tokensPerMinute: 1_000_000 }, clock);
    // 3 × 0.9 headroom leaves 2 a minute.
    await pacer.reserve(10);
    await pacer.reserve(10);
    expect(clock.slept).toEqual([]);
    await pacer.reserve(10);
    expect(clock.now()).toBeGreaterThanOrEqual(60_000);
  });

  it("counts the real tokens once settled, and lets an oversized call through alone", async () => {
    const clock = fakeClock();
    const pacer = new Pacer({ requestsPerMinute: 100, tokensPerMinute: 1000 }, clock);
    const ticket = await pacer.reserve(800);
    // As big as guessed, but mostly cached: 100 counted.
    ticket?.settle({ inputTokens: 780, cachedInputTokens: 700, outputTokens: 20 });
    await pacer.reserve(700);
    expect(clock.slept).toEqual([]);
    const huge = await pacer.reserve(5000);
    expect(huge).not.toBeNull();
    expect(clock.now()).toBeGreaterThanOrEqual(60_000);
  });

  it("gives up waiting when told to stop", async () => {
    const clock = fakeClock();
    const pacer = new Pacer({ requestsPerMinute: 2, tokensPerMinute: 1000 }, clock);
    await pacer.reserve(10);
    expect(await pacer.reserve(10, () => true)).toBeNull();
  });

  it("starts from calls made in the last minute", async () => {
    const clock = fakeClock();
    // 900 × 0.9 headroom = 810; 700 already spent leaves room for 110.
    const pacer = new Pacer({ requestsPerMinute: 100, tokensPerMinute: 900 }, clock, [{ at: -30_000, tokens: 700 }]);
    await pacer.reserve(200);
    expect(clock.now()).toBeGreaterThanOrEqual(30_000);
  });

  it("books tokens the provider counted that it didn't see", async () => {
    const clock = fakeClock();
    const pacer = new Pacer({ requestsPerMinute: 100, tokensPerMinute: 1000 }, clock);
    const ticket = await pacer.reserve(100);
    ticket?.settle({ inputTokens: 100, cachedInputTokens: 0, outputTokens: 0 });
    // The provider says 100 left: 800 were spent somewhere else.
    pacer.observeRemaining(100);
    await pacer.reserve(100);
    expect(clock.now()).toBeGreaterThanOrEqual(60_000);
  });

  it("doesn't book anything when the provider counts less than it did", async () => {
    const clock = fakeClock();
    const pacer = new Pacer({ requestsPerMinute: 100, tokensPerMinute: 1000 }, clock);
    const ticket = await pacer.reserve(400);
    ticket?.settle({ inputTokens: 400, cachedInputTokens: 0, outputTokens: 0 });
    pacer.observeRemaining(900);
    await pacer.reserve(400);
    expect(clock.slept).toEqual([]);
  });

  it("scales its guesses by how far off past ones were", async () => {
    const clock = fakeClock();
    const pacer = new Pacer({ requestsPerMinute: 100, tokensPerMinute: 1000 }, clock);
    // Guessed 400, really 200: later guesses are halved. Cached input still
    // isn't booked, but counts as real size for the scale.
    const first = await pacer.reserve(400);
    first?.settle({ inputTokens: 180, cachedInputTokens: 100, outputTokens: 20 });
    // 100 booked so far; a guess of 1200 books 600, which fits under 900.
    await pacer.reserve(1200);
    expect(clock.slept).toEqual([]);
  });
});

describe("provider errors", () => {
  const err = (statusCode: number, body: string, headers?: Record<string, string>) =>
    new APICallError({ message: body, url: "u", requestBodyValues: {}, statusCode, responseBody: body, responseHeaders: headers });
  const describe_ = (e: unknown) => (e instanceof Error ? e.message : String(e));

  it("tells the daily limit from a per-minute one", () => {
    expect(classifyFailure(err(429, "Rate limit reached on tokens per day (TPD)"), describe_).kind).toBe("daily");
    expect(classifyFailure(err(429, "Rate limit reached on requests per day (RPD)"), describe_).kind).toBe("daily");
    expect(classifyFailure(err(429, "4006: you have used up your daily free allocation of 10,000 neurons"), describe_).kind).toBe("daily");
    const busy = classifyFailure(err(429, "tokens per minute (TPM). Please try again in 1m2.5s"), describe_);
    expect(busy).toMatchObject({ kind: "busy", waitMs: 62_500, limit: true });
    expect(classifyFailure(err(429, "slow down", { "retry-after": "7" }), describe_)).toMatchObject({ kind: "busy", waitMs: 7000 });
  });

  it("sorts the rest", () => {
    expect(classifyFailure(err(503, "over capacity"), describe_)).toMatchObject({ kind: "busy", waitMs: null, limit: false });
    expect(classifyFailure(err(401, "bad key"), describe_).kind).toBe("config");
    expect(classifyFailure(err(404, "no model"), describe_).kind).toBe("config");
    expect(classifyFailure(err(500, "oops"), describe_).kind).toBe("try");
    expect(classifyFailure(new Error("socket hang up"), describe_).kind).toBe("try");
  });

  it("waits the provider's hint plus a second, else backs off, never past 90s", () => {
    expect(busyWaitMs({ kind: "busy", message: "", waitMs: 2000, limit: true }, 0)).toBe(3000);
    expect([0, 1, 2].map((a) => busyWaitMs({ kind: "busy", message: "", waitMs: null, limit: true }, a))).toEqual([15_000, 30_000, 60_000]);
    expect(busyWaitMs({ kind: "busy", message: "", waitMs: 600_000, limit: true }, 0)).toBe(90_000);
  });
});

describe("redaction", () => {
  it("replaces every known secret and ignores short or missing ones", () => {
    const redact = makeRedactor(["gsk_secretkey123", undefined, "abc"]);
    expect(redact("key gsk_secretkey123 and gsk_secretkey123 abc")).toBe(`key ${REDACTED} and ${REDACTED} abc`);
  });

  it("keeps a key out of the store even if a message carried it", () => {
    const store = new EvalStore(":memory:", makeRedactor(["gsk_secretkey123"]));
    store.cachePut("k", JSON.stringify({ text: "gsk_secretkey123" }), "2026-01-01");
    expect(store.cacheGet("k")).not.toContain("gsk_secretkey123");
  });
});

describe("store", () => {
  it("adds up today's calls and tokens per provider", () => {
    const store = new EvalStore(":memory:", makeRedactor([]));
    store.recordProviderCall({ at: 1000, provider: "groq", model: "m", inputTokens: 100, cachedInputTokens: 40, outputTokens: 10 });
    store.recordProviderCall({ at: 5000, provider: "groq", model: "m", inputTokens: 100, cachedInputTokens: 0, outputTokens: 10 });
    store.recordProviderCall({ at: 5000, provider: "google", model: "g", inputTokens: 999, cachedInputTokens: 0, outputTokens: 0 });
    expect(store.usageSince("groq", 0)).toEqual({ calls: 2, inputTokens: 200, cachedInputTokens: 40, outputTokens: 20 });
    expect(store.usageSince("groq", 2000)).toEqual({ calls: 1, inputTokens: 100, cachedInputTokens: 0, outputTokens: 10 });
  });
});

describe("run plan", () => {
  const plan = (useCache: boolean) => buildRunConfig({ config, version, datasetVersion: "v1", split: "dev", tasks: [task], useCache, smoke: false });

  it("fingerprints a run by everything that changes its results", () => {
    expect(runFingerprint(plan(true))).toBe(runFingerprint(plan(true)));
    expect(runFingerprint(plan(false))).not.toBe(runFingerprint(plan(true)));
    expect(runFingerprint({ ...plan(true), agentHash: "x" })).not.toBe(runFingerprint(plan(true)));
    expect(runFingerprint({ ...plan(true), smoke: true })).not.toBe(runFingerprint(plan(true)));
    // A different pool is a different run.
    const groqOnly = plan(true);
    groqOnly.agent.pool = groqOnly.agent.pool.slice(0, 1);
    expect(runFingerprint(groqOnly)).not.toBe(runFingerprint(plan(true)));
  });

  it("makes ids that sort by start time", () => {
    expect(newRunId(new Date("2026-10-15T14:22:33Z"))).toMatch(/^20261015-142233-[0-9a-f]{4}$/);
  });
});

describe("budget", () => {
  const none = { calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
  const providers = config.agent.pool.map((m) => ({ provider: m.provider, limits: m.freeTierLimits, usedToday: none }));
  // 2,000 counted tokens a call: 100 calls a day on Groq (200k tokens),
  // 122 on Cloudflare (about 82 neurons each out of 10,000).
  const usagePerCall = { inputTokens: 1500, cachedInputTokens: 0, outputTokens: 500 };

  it("counts each provider's day in its own unit", () => {
    const b = estimateBudget({ triesLeft: 140, cachedTries: 0, callsPerTry: 4, usagePerCall, providers });
    expect(b).toMatchObject({ calls: 560, countedTokens: 1_120_000, fitsToday: false, days: 3 });
    expect(b.providers.map((p) => [p.provider, p.unit, p.callsPerDay])).toEqual([
      ["groq", "tokens", 100],
      ["cloudflare", "neurons", 122],
    ]);
  });

  it("leaves out cached tries and what's already used today", () => {
    const cached = estimateBudget({ triesLeft: 140, cachedTries: 140, callsPerTry: 4, usagePerCall, providers });
    expect(cached).toMatchObject({ calls: 0, fitsToday: true, days: 1 });
    const used = [{ ...providers[0], usedToday: { calls: 50, inputTokens: 150_000, cachedInputTokens: 0, outputTokens: 50_000 } }];
    expect(estimateBudget({ triesLeft: 1, cachedTries: 0, callsPerTry: 4, usagePerCall, providers: used }).providers[0].callsLeftToday).toBe(0);
  });

  // What the gate shows: tries the cache already holds cost nothing.
  const tasks = [task, { ...task, id: "status-02" }];
  const count = (cachedKeys: Set<string>, finished = new Set<string>(), keyFor = (t: typeof task, n: number): string | null => tryKey(t.id, n)) =>
    countRemaining({ tasks, triesPerTask: 2, finished, keyFor, isCached: (key) => cachedKeys.has(key) });
  const callsFor = (r: { left: number; cached: number }) =>
    estimateBudget({ triesLeft: r.left, cachedTries: r.cached, callsPerTry: 4, usagePerCall, providers }).calls;

  it("estimates 0 calls for a fully cached run", () => {
    const all = new Set(tasks.flatMap((t) => [tryKey(t.id, 1), tryKey(t.id, 2)]));
    const r = count(all);
    expect(r).toEqual({ left: 4, cached: 4 });
    expect(callsFor(r)).toBe(0);
  });

  it("estimates only the missing tries of a half-cached run", () => {
    const r = count(new Set([tryKey("status-01", 1), tryKey("status-02", 1)]));
    expect(r).toEqual({ left: 4, cached: 2 });
    expect(callsFor(r)).toBe(8);
  });

  it("skips finished tries and counts an unknown request as not cached", () => {
    expect(count(new Set(), new Set([tryKey("status-01", 1)]))).toEqual({ left: 3, cached: 0 });
    expect(count(new Set([tryKey("status-01", 1)]), new Set(), () => null)).toEqual({ left: 4, cached: 0 });
  });
});

describe("cost", () => {
  it("prices cached input at its own rate", () => {
    expect(costUsd({ inputTokens: 1_000_000, cachedInputTokens: 500_000, outputTokens: 1_000_000 }, { input: 0.15, cachedInput: 0.075, output: 0.6 })).toBeCloseTo(
      0.075 + 0.0375 + 0.6,
    );
  });
});
