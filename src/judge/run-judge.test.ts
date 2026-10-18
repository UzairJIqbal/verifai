import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config";
import type { Clock } from "../eval/pacer";
import { EvalStore } from "../eval/store";
import type { RecordedTrial } from "../results/schema";
import type { JudgeSetup } from "./claims";
import { callsToSend, planJudge, runJudge } from "./run-judge";

const judge = loadConfig().judge;
const setup: JudgeSetup = { model: judge.model, temperature: 0, thinkingLevel: judge.thinkingLevel, promptVersion: "v1 · test", prompt: "Judge the replies." };
const background = { policy: "Orders can be cancelled only while processing.", today: "2026-03-20" };
const tasks = new Map([["cancel-01", { expected: { changes: [], facts: [], refusal: true } }]]);

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};
const answer = (text: string) => ({ content: [{ type: "text" as const, text }], finishReason: { unified: "stop" as const, raw: "stop" }, usage, warnings: [] });

const trial = (tryNumber: number, reply: string | null, status: RecordedTrial["status"] = "passed"): RecordedTrial => ({
  taskId: "cancel-01",
  category: "cancel",
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
  steps: [{ type: "customer", text: `Cancel order 1234. (try ${tryNumber})` }, ...(reply === null ? [] : [{ type: "text" as const, step: 1, text: reply }])],
  claims: null,
  judge: null,
});

function fakeClock(): Clock {
  let t = 1_000_000;
  return { now: () => t, sleep: async (ms) => void (t += ms) };
}

const run = (store: EvalStore, trials: RecordedTrial[], model: MockLanguageModelV4) =>
  runJudge({
    store,
    plan: planJudge(store, setup, trials, tasks, background),
    judge,
    setup,
    model,
    clock: fakeClock(),
    sentToday: 0,
    describeError: (e) => String(e),
    stopRequested: () => false,
    onNotice: () => {},
    onProgress: () => {},
  });

const verdicts = (...criteria: string[]) => JSON.stringify({ verdicts: criteria.map((criterion) => ({ criterion, verdict: "pass", reason: "r" })) });

describe("AI judge", () => {
  it("sends one call per try with a reply, asks refusal explained only of the try that refused, and sends nothing the second time", async () => {
    const store = new EvalStore(":memory:", (t) => t);
    const trials = [trial(1, "I can't cancel it: it has shipped. You can ask for a refund once it arrives."), trial(2, "Done, it's cancelled."), trial(3, null), trial(4, "x", "errored")];
    const plan = planJudge(store, setup, trials, tasks, background);
    expect(plan).toMatchObject({ noReplies: 1, errored: 1 });
    expect(plan.jobs.map((j) => j.request.criteria)).toEqual([["refusal-explained", "answered-question", "tone"], ["answered-question", "tone"]]);

    const first = new MockLanguageModelV4({
      doGenerate: async ({ prompt }) => answer(JSON.stringify(prompt).includes("refusal-explained") ? verdicts("refusal-explained", "answered-question", "tone") : verdicts("answered-question", "tone")),
    });
    const out = await run(store, trials, first);
    expect(first.doGenerateCalls).toHaveLength(2);
    expect(out.stop).toBeNull();
    expect(out.judgments.map((j) => [j.tryNumber, j.judge.status === "judged" ? j.judge.verdicts.map((v) => v.criterion) : j.judge.status])).toEqual([
      [1, ["refusal-explained", "answered-question", "tone"]],
      [2, ["answered-question", "tone"]],
    ]);

    expect(callsToSend(planJudge(store, setup, trials, tasks, background))).toBe(0);
    const second = new MockLanguageModelV4({ doGenerate: answer("unused") });
    const again = await run(store, trials, second);
    expect(second.doGenerateCalls).toHaveLength(0);
    expect(again.judgments).toEqual(out.judgments);
  });

  it("asks again when the rubric's words change", async () => {
    const store = new EvalStore(":memory:", (t) => t);
    const trials = [trial(1, "Done, it's cancelled.")];
    await run(store, trials, new MockLanguageModelV4({ doGenerate: answer(verdicts("answered-question", "tone")) }));
    const edited = { ...setup, prompt: "Judge the replies carefully." };
    expect(callsToSend(planJudge(store, edited, trials, tasks, background))).toBe(1);
  });

  it("records a malformed answer as couldn't grade", async () => {
    const store = new EvalStore(":memory:", (t) => t);
    const out = await run(store, [trial(1, "Done, it's cancelled.")], new MockLanguageModelV4({ doGenerate: answer('{"score": 8}') }));
    expect(out.judgments[0].judge.status).toBe("ungraded");
  });
});
