import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config";
import type { Clock } from "../eval/pacer";
import { EvalStore } from "../eval/store";
import type { RecordedTrial } from "../results/schema";
import { claimsRequest, readClaimsAnswer, type JudgeSetup } from "./claims";
import { callsToSend, planClaims, runClaims } from "./run-claims";

const judge = loadConfig().judge;
const setup: JudgeSetup = { model: judge.model, temperature: 0, thinkingLevel: judge.thinkingLevel, promptVersion: "test", prompt: "Label the claims." };
const background = { policy: "Refunds within 14 days of delivery.", today: "2026-03-20" };

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};
const answer = (text: string) => ({ content: [{ type: "text" as const, text }], finishReason: { unified: "stop" as const, raw: "stop" }, usage, warnings: [] });

const trial = (tryNumber: number, reply: string | null, status: RecordedTrial["status"] = "passed"): RecordedTrial => ({
  taskId: "status-01",
  category: "status",
  tryNumber,
  status,
  end: status === "errored" ? null : "answered",
  error: null,
  verdicts: [],
  calls: 1,
  cachedCalls: 0,
  usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
  costUsd: 0,
  modelLatencyMs: 0,
  startedAt: "2026-10-15T10:00:00.000Z",
  finishedAt: "2026-10-15T10:00:01.000Z",
  traceUrl: null,
  steps: [{ type: "customer", text: `Where is order 1012? (try ${tryNumber})` }, ...(reply === null ? [] : [{ type: "text" as const, step: 1, text: reply }])],
  claims: null,
  judge: null,
});

// Time that only moves when something sleeps.
function fakeClock(): Clock {
  let t = 1_000_000;
  return { now: () => t, sleep: async (ms) => void (t += ms) };
}

const run = (store: EvalStore, trials: RecordedTrial[], model: MockLanguageModelV4, sentToday = 0) =>
  runClaims({
    store,
    plan: planClaims(store, setup, trials, background),
    judge,
    setup,
    model,
    clock: fakeClock(),
    sentToday,
    describeError: (e) => String(e),
    stopRequested: () => false,
    onNotice: () => {},
    onProgress: () => {},
  });

const GOOD = JSON.stringify({ claims: [{ step: 1, claim: "Order 1012 shipped.", label: "unsupported", evidence: "none", reason: "No lookup was made." }] });

describe("claim checker", () => {
  it("sends one call per try with a reply, none for errored or reply-less tries, and none at all the second time", async () => {
    const store = new EvalStore(":memory:", (t) => t);
    const trials = [trial(1, "Order 1012 shipped."), trial(2, null), trial(3, "Order 1012 shipped.", "errored")];
    const first = new MockLanguageModelV4({ doGenerate: answer(GOOD) });
    const out = await run(store, trials, first);
    expect(first.doGenerateCalls).toHaveLength(1);
    expect(out.stop).toBeNull();
    expect(out.checks.map((c) => [c.tryNumber, c.claims.status])).toEqual([
      [1, "checked"],
      [2, "checked"],
    ]);
    expect(out.checks[0].claims).toMatchObject({ claims: [{ step: 1, label: "unsupported", text: "Order 1012 shipped." }] });

    const plan = planClaims(store, setup, trials, background);
    expect(callsToSend(plan)).toBe(0);
    const second = new MockLanguageModelV4({ doGenerate: answer(GOOD) });
    const again = await run(store, trials, second);
    expect(second.doGenerateCalls).toHaveLength(0);
    expect(again.checks).toEqual(out.checks);
  });

  it("prices each call at the judge's rates, replays the same price from the cache, and says when an old answer has none", async () => {
    const store = new EvalStore(":memory:", (t) => t);
    const trials = [trial(1, "Order 1012 shipped."), trial(2, null)];
    const p = judge.pricePerMillionTokensUsd;
    const expected = { usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 5 }, costUsd: (10 * p.input + 5 * p.output) / 1_000_000 };

    const first = await run(store, trials, new MockLanguageModelV4({ doGenerate: answer(GOOD) }));
    expect(first.checks.map((c) => c.claims.cost)).toEqual([expected, { usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }, costUsd: 0 }]);
    expect(first.uncosted).toBe(0);

    const replay = await run(store, trials, new MockLanguageModelV4({ doGenerate: answer(GOOD) }));
    expect(replay.checks[0].claims.cost).toEqual(expected);

    // An answer cached before tokens were saved: its cost is unknown, not zero.
    const [job] = planClaims(store, setup, trials, background).jobs;
    store.cachePut(job.key, GOOD, "2026-10-01T00:00:00.000Z");
    const old = await run(store, trials, new MockLanguageModelV4({ doGenerate: answer(GOOD) }));
    expect(old.checks[0].claims.cost).toBeUndefined();
    expect(old.uncosted).toBe(1);
  });

  it("records a malformed answer as couldn't grade, and doesn't ask again for it", async () => {
    const store = new EvalStore(":memory:", (t) => t);
    const trials = [trial(1, "Order 1012 shipped.")];
    const model = new MockLanguageModelV4({ doGenerate: answer("The reply looks fine to me.") });
    const out = await run(store, trials, model);
    expect(out.checks[0].claims.status).toBe("ungraded");
    expect(callsToSend(planClaims(store, setup, trials, background))).toBe(0);
  });

  it("stops before the daily limit without sending", async () => {
    const store = new EvalStore(":memory:", (t) => t);
    const model = new MockLanguageModelV4({ doGenerate: answer(GOOD) });
    const out = await run(store, [trial(1, "Order 1012 shipped.")], model, judge.freeTierLimits.requestsPerDay);
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(out.stop?.reason).toBe("daily");
    expect(out.checks).toEqual([]);
  });
});

describe("reading the judge's answer", () => {
  const request = claimsRequest(trial(1, "Order 1012 shipped.").steps, background);

  it("numbers steps as the trajectory does and lists the policy and today", () => {
    expect(request.replySteps).toEqual([1]);
    expect(request.input).toContain("TODAY: 2026-03-20");
    expect(request.input).toContain("Refunds within 14 days of delivery.");
    expect(request.input).toContain("[step 1] AGENT REPLY: Order 1012 shipped.");
  });

  it("reads an answer in a ```json fence", () => {
    expect(readClaimsAnswer(`\`\`\`json\n${GOOD}\n\`\`\``, request, setup).status).toBe("checked");
  });

  it("can't grade a claim placed at a step that isn't a reply", () => {
    const stray = JSON.stringify({ claims: [{ step: 0, claim: "x", label: "supported", evidence: "none", reason: "r" }] });
    expect(readClaimsAnswer(stray, request, setup)).toMatchObject({ status: "ungraded" });
  });

  it("can't grade a label outside the three", () => {
    const scored = JSON.stringify({ claims: [{ step: 1, claim: "x", label: "7/10", evidence: "none", reason: "r" }] });
    expect(readClaimsAnswer(scored, request, setup)).toMatchObject({ status: "ungraded" });
  });
});
