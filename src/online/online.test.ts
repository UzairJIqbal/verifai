import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { APICallError, type LanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterAll, describe, expect, it } from "vitest";
import { loadConfig } from "../config";
import { loadAgentVersion } from "../agent/versions";
import { Pacer } from "../eval/pacer";
import type { PoolProvider } from "../eval/runner";
import { testShop } from "../graders/fixtures";
import { scripted } from "../graders/script";
import type { ClaimCheck, TrialVerdict } from "../results/schema";
import { taskSchema } from "../tasks/schema";
import { applyClaims, buildBatch, gradeSample, toConversation } from "./batch";
import { runOnlineConversation, type OnlineSetup } from "./conversation";
import { customerGoal, customerInstructions, customerView, loadCustomerPrompt, parseCustomerPrompt, readCustomerReply } from "./customer";
import { listBatches, readBatch, writeBatch } from "./files";
import { flagReasons, ONLINE_GRADERS } from "./grade";
import { CallFailed, makePoolCaller, StopTraffic, type PoolCaller } from "./pool";
import { pickSample, planBatch, sampleSize } from "./sample";
import type { Batch, Conversation } from "./schema";
import { batchRates, hallucinated, isAlert } from "./stats";
import { conversationTrial } from "./trial";

const { seedPath, shop, dispose } = testShop("online");
afterAll(dispose);

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};
const reply = (text: string) => ({ content: [{ type: "text" as const, text }], finishReason: { unified: "stop" as const, raw: "stop" }, usage, warnings: [] });
const toolCall = (id: string, toolName: string, input: unknown) => ({
  content: [{ type: "tool-call" as const, toolCallId: id, toolName, input: JSON.stringify(input) }],
  finishReason: { unified: "tool-calls" as const, raw: "tool-calls" },
  usage,
  warnings: [],
});
const end = (outcome: string, reason: string) => toolCall("end", "end_conversation", { outcome, reason });

const task = taskSchema.parse({
  id: "cancel-99",
  split: "dev",
  category: "cancel",
  difficulty: "easy",
  adversarial: false,
  note: "the agent should cancel it",
  first_message: "Hi, my email is esha.qureshi@example.com. Please cancel order 1005.",
  canned_replies: ["Yes, please go ahead."],
  expected: { changes: [{ op: "update", table: "orders", key: { id: 1005 }, set: { status: "cancelled" } }] },
  reference: [{ tool: "cancel_order", input: { order_id: 1005 } }],
});

const PROMPT = `## instructions
Goal: {{goal}}
Persona: {{persona}}
At most {{maxTurns}} messages.

## opener
The chat is open. Write your first message.

## persona: patient
calm

## persona: angry
cross

## persona: vague
unclear

## persona: pushy-refund
wants money back
`;

describe("customer prompt", () => {
  it("reads its sections and fills the placeholders", () => {
    const prompt = parseCustomerPrompt(PROMPT, "t1");
    expect(prompt.opener).toBe("The chat is open. Write your first message.");
    expect(customerInstructions(prompt, "angry", "cancel it", 8)).toBe("Goal: cancel it\nPersona: cross\nAt most 8 messages.");
  });

  it("refuses a file missing a persona or a placeholder", () => {
    expect(() => parseCustomerPrompt(PROMPT.replace("## persona: vague\nunclear\n", ""), "t1")).toThrow(/persona: vague/);
    expect(() => parseCustomerPrompt(PROMPT.replace("{{maxTurns}}", "8"), "t1")).toThrow(/maxTurns/);
  });

  it("the configured version on disk parses", () => {
    expect(() => loadCustomerPrompt(loadConfig().online.customerPromptVersion)).not.toThrow();
  });
});

describe("what the customer sees", () => {
  it("its goal holds only the customer's side of the task", () => {
    const goal = customerGoal(task);
    expect(goal).toContain(task.first_message);
    expect(goal).toContain("Yes, please go ahead.");
    expect(goal).not.toContain("should cancel");
    expect(goal).not.toContain("cancel_order");
  });

  it("the chat is its own messages and the agent's replies, nothing else", () => {
    expect(customerView("open", [{ customer: "cancel 1005", agent: "Shall I?" }])).toEqual([
      { role: "user", content: "open" },
      { role: "assistant", content: "cancel 1005" },
      { role: "user", content: "Shall I?" },
    ]);
  });

  it("reads a message, an end, and what can't be used", () => {
    expect(readCustomerReply(" hi ", [])).toEqual({ kind: "message", text: "hi" });
    expect(readCustomerReply("bye", [{ toolName: "end_conversation", input: { outcome: "gave-up", reason: "no help" } }])).toEqual({
      kind: "end",
      outcome: "gave-up",
      reason: "no help",
    });
    expect(readCustomerReply("", [{ toolName: "end_conversation", input: { outcome: "won" } }]).kind).toBe("invalid");
    expect(readCustomerReply("", [{ toolName: "cancel_order", input: {} }]).kind).toBe("invalid");
    expect(readCustomerReply("  ", []).kind).toBe("invalid");
  });
});

// Every call straight to one mock model: the customer's and the agent's in turn.
const passThrough =
  (model: LanguageModel): PoolCaller =>
  async (_guess, send) => ({ result: await send(model), provider: "test", latencyMs: 0 });

function onlineSetup(model: MockLanguageModelV4, maxTurns = 8): OnlineSetup {
  return {
    agent: { model, provider: "test", temperature: 0, maxSteps: 3, stepTimeoutMs: 1000, reasoningEffort: "low", version: loadAgentVersion(loadConfig(), "2026-03-15") },
    customer: { prompt: parseCustomerPrompt(PROMPT, "t1"), maxTurns, temperature: 1, reasoningEffort: "low", stepTimeoutMs: 1000 },
    call: passThrough(model),
    describeError: (e) => (e instanceof Error ? e.message : String(e)),
  };
}

describe("an online conversation", () => {
  it("runs until the customer ends it, on its own copy of the shop", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: [
        reply("Please cancel order 1005."),
        reply("Shall I cancel order 1005?"),
        reply("Yes."),
        toolCall("a", "cancel_order", { order_id: 1005 }),
        reply("Done."),
        end("goal-met", "it's cancelled"),
      ],
    });
    const driven = await runOnlineConversation(onlineSetup(model), { persona: "patient", text: "cancel 1005" }, undefined, seedPath);
    expect(driven).toMatchObject({ status: "finished", end: "goal-met", endReason: "it's cancelled", turns: 2 });
    expect(driven.customerCalls).toHaveLength(3);
    expect(driven.trajectory?.changes).toEqual([
      { kind: "update", table: "orders", key: { id: 1005 }, before: { status: "processing" }, after: { status: "cancelled" } },
    ]);
    // The customer's calls never carried the agent's prompt or tools.
    const customerCall = model.doGenerateCalls[2];
    expect(customerCall.tools?.map((t) => t.name)).toEqual(["end_conversation"]);
    expect(JSON.stringify(customerCall.prompt)).not.toContain("cancel_order");
  });

  it("the customer's calls carry only its persona, its goal and the chat", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: [
        reply("Please cancel order 1005."),
        reply("Shall I cancel order 1005?"),
        reply("Yes."),
        toolCall("a", "cancel_order", { order_id: 1005 }),
        reply("Done."),
        end("goal-met", "it's cancelled"),
      ],
    });
    const setup = onlineSetup(model);
    await runOnlineConversation(setup, { persona: "angry", text: customerGoal(task) }, undefined, seedPath);
    const isCustomer = (c: (typeof model.doGenerateCalls)[number]) => (c.tools ?? []).every((t) => t.name === "end_conversation");
    const customerCalls = model.doGenerateCalls.filter(isCustomer);
    const agentTools = new Set(model.doGenerateCalls.filter((c) => !isCustomer(c)).flatMap((c) => (c.tools ?? []).map((t) => t.name)));
    expect(customerCalls).toHaveLength(3);
    expect(agentTools.size).toBeGreaterThan(0);
    for (const call of customerCalls) {
      const seen = JSON.stringify(call.prompt);
      expect(seen).toContain("cross");
      expect(seen).not.toContain(setup.agent.version.systemPrompt.slice(0, 80));
      for (const name of agentTools) expect(seen).not.toContain(name);
      expect(seen).not.toContain(task.note);
      expect(seen).not.toContain(JSON.stringify(task.expected));
      expect(seen).not.toContain("order_id");
    }
  });

  it("stops at the turn limit", async () => {
    const model = new MockLanguageModelV4({ doGenerate: [reply("hello"), reply("Hi, how can I help?")] });
    const driven = await runOnlineConversation(onlineSetup(model, 1), { persona: "vague", text: "x" }, undefined, seedPath);
    expect(driven).toMatchObject({ status: "finished", end: "turn-limit", turns: 1 });
  });

  it("errors when the customer ends before writing anything", async () => {
    const model = new MockLanguageModelV4({ doGenerate: [end("gave-up", "bored")] });
    const driven = await runOnlineConversation(onlineSetup(model), { persona: "angry", text: "x" }, undefined, seedPath);
    expect(driven.status).toBe("errored");
    expect(driven.trajectory).toBeNull();
    expect(driven.error).toMatch(/before writing anything/);
  });

  it("lets a stop of the whole batch through", async () => {
    const model = new MockLanguageModelV4({ doGenerate: [reply("hi")] });
    const stop: PoolCaller = () => Promise.reject(new StopTraffic("daily", "used up"));
    const setup = { ...onlineSetup(model), call: stop };
    await expect(runOnlineConversation(setup, { persona: "patient", text: "x" }, undefined, seedPath)).rejects.toBeInstanceOf(StopTraffic);
  });
});

describe("the pool caller", () => {
  const clock = { now: () => 0, sleep: async () => {} };
  const fake = (provider: string, o: { daily?: string | null } = {}): PoolProvider => ({
    provider,
    label: provider,
    model: new MockLanguageModelV4(),
    pacer: new Pacer({ requestsPerMinute: 100, tokensPerMinute: null }, clock),
    describeError: (e) => (e instanceof Error ? e.message : String(e)),
    dailyAfterLimitErrors: null,
    dailyLimitReached: () => o.daily ?? null,
  });
  const result = { usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 } };
  const apiError = (statusCode: number) => new APICallError({ message: "nope", url: "https://example.test", requestBodyValues: {}, statusCode, responseBody: "nope" });

  it("goes to the next provider when the first is used up today, and records the call", async () => {
    const notices: string[] = [];
    const recorded: string[] = [];
    const call = makePoolCaller({ pool: [fake("a", { daily: "1000 calls" }), fake("b")], clock, stopRequested: () => false, maxCalls: 100, onNotice: (m) => notices.push(m), record: (c) => recorded.push(c.provider) });
    expect((await call(10, async () => result)).provider).toBe("b");
    expect(recorded).toEqual(["b"]);
    expect(notices[0]).toMatch(/carrying on with b/);
  });

  it("stops the batch when every provider is used up, or on a bad key", async () => {
    const used = makePoolCaller({ pool: [fake("a", { daily: "x" })], clock, stopRequested: () => false, maxCalls: 100, onNotice: () => {}, record: () => {} });
    await expect(used(10, async () => result)).rejects.toMatchObject({ reason: "daily" });
    const badKey = makePoolCaller({ pool: [fake("a")], clock, stopRequested: () => false, maxCalls: 100, onNotice: () => {}, record: () => {} });
    await expect(badKey(10, () => Promise.reject(apiError(401)))).rejects.toMatchObject({ reason: "config" });
  });

  it("stops the batch at its call cap, counting failed calls too", async () => {
    let sends = 0;
    const call = makePoolCaller({ pool: [fake("a")], clock, stopRequested: () => false, maxCalls: 3, onNotice: () => {}, record: () => {} });
    await call(10, async () => (sends++, result));
    await expect(call(10, () => (sends++, Promise.reject(new Error("bad output"))))).rejects.toBeInstanceOf(CallFailed);
    await call(10, async () => (sends++, result));
    await expect(call(10, async () => (sends++, result))).rejects.toMatchObject({ reason: "cap" });
    expect(sends).toBe(3);
  });

  it("fails just the call on an ordinary error, and stops on Ctrl-C", async () => {
    const call = makePoolCaller({ pool: [fake("a")], clock, stopRequested: () => false, maxCalls: 100, onNotice: () => {}, record: () => {} });
    await expect(call(10, () => Promise.reject(new Error("bad output")))).rejects.toBeInstanceOf(CallFailed);
    const stopped = makePoolCaller({ pool: [fake("a")], clock, stopRequested: () => true, maxCalls: 100, onNotice: () => {}, record: () => {} });
    await expect(stopped(10, async () => result)).rejects.toMatchObject({ reason: "interrupted" });
  });
});

describe("planning and sampling", () => {
  const other = { ...task, id: "refund-1" };

  it("the same batch id always gives the same plan and sample", () => {
    expect(planBatch("b1", [task, other], 6)).toEqual(planBatch("b1", [other, task], 6));
    expect([...pickSample("b1", [1, 2, 3, 4, 5, 6], 0.5)]).toEqual([...pickSample("b1", [6, 5, 4, 3, 2, 1], 0.5)]);
  });

  it("refuses a holdout task as a goal", () => {
    expect(() => planBatch("b", [task, { ...task, id: "h-1", split: "holdout" }], 3)).toThrow(/holdout/);
  });

  it("samples the configured share, at least one", () => {
    expect(sampleSize(20, 0.5)).toBe(10);
    expect(sampleSize(3, 0.1)).toBe(1);
    expect(sampleSize(0, 0.5)).toBe(0);
    expect(pickSample("b2", [1, 2, 3, 4], 0.5).size).toBe(2);
  });
});

const verdict = (grader: string, pass: boolean, ungraded = false): TrialVerdict => ({ grader, pass, reason: pass ? "fine" : ungraded ? "couldn't grade: x" : "broke it", step: null, ungraded, spans: [] });
const allPass = (): TrialVerdict[] => ONLINE_GRADERS.map((g) => verdict(g, true));
const checked = (labels: ("supported" | "unsupported" | "contradicted")[]): ClaimCheck => ({
  status: "checked",
  model: "judge",
  promptVersion: "v1",
  claims: labels.map((label, i) => ({ step: i, text: `claim ${i}`, label, evidence: "", reason: "why" })),
});

function conversation(number: number, o: Partial<Conversation> = {}): Conversation {
  return {
    number,
    templateId: "cancel-99",
    category: "cancel",
    difficulty: "easy",
    persona: "patient",
    status: "finished",
    end: "goal-met",
    endReason: "done",
    error: null,
    turns: 1,
    sampled: true,
    verdicts: allPass(),
    claims: checked(["supported"]),
    flags: [],
    calls: 1,
    usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 },
    customerCalls: 1,
    customerUsage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 },
    costUsd: 0,
    startedAt: "2026-10-24T00:00:00.000Z",
    finishedAt: "2026-10-24T00:00:01.000Z",
    steps: [{ type: "customer", text: "hi" }],
    ...o,
  };
}

describe("flags", () => {
  it("flags a broken policy rule, a fabrication and an unsupported claim; not a loop or a tool error", () => {
    const verdicts = allPass().map((v) => (v.grader === "loop" || v.grader === "arguments" ? { ...v, pass: false } : v));
    expect(flagReasons(verdicts, checked(["supported"]))).toEqual([]);
    const policy = ONLINE_GRADERS[1];
    const flagged = flagReasons(
      allPass().map((v) => (v.grader === policy || v.grader === "fabricated-entity" ? { ...v, pass: false, reason: "broke it" } : v)),
      checked(["supported", "unsupported"]),
    );
    expect(flagged).toEqual([`policy: ${policy}: broke it`, "fabricated-entity: broke it", 'unsupported claim: "claim 1" (why)']);
  });

  it("a check that couldn't run flags it; a missing claim check doesn't", () => {
    expect(flagReasons(allPass(), { status: "ungraded", model: "judge", promptVersion: "v1", reason: "bad JSON" })).toEqual(["claims: couldn't grade: bad JSON"]);
    expect(flagReasons(allPass(), null)).toEqual([]);
  });

  it("grades the sample only, with the online graders", () => {
    const trajectory = scripted(seedPath, [{ customer: "Where is order 1005?" }, { say: "Let me check." }]);
    const plain = [conversation(1, { sampled: false, verdicts: [], claims: null }), conversation(2, { sampled: false, verdicts: [], claims: null })];
    const graded = gradeSample(plain, new Set([2]), new Map([[2, trajectory]]), shop, "policy text");
    expect(graded[0]).toMatchObject({ sampled: false, verdicts: [] });
    expect(graded[1].sampled).toBe(true);
    expect(graded[1].verdicts.map((v) => v.grader)).toEqual([...ONLINE_GRADERS]);
    const withClaims = applyClaims(graded, [{ tryNumber: 2, claims: checked(["contradicted"]) }]);
    expect(withClaims[1].flags).toEqual(['contradicted claim: "claim 0" (why)']);
  });
});

describe("batch rates", () => {
  it("counts over graded conversations only, with an interval", () => {
    const list = [
      conversation(1),
      conversation(2, { verdicts: allPass().map((v) => (v.grader === "fabricated-action" ? { ...v, pass: false } : v)) }),
      conversation(3, { claims: checked(["unsupported"]) }),
      conversation(4),
      conversation(5, { sampled: false, verdicts: [], claims: null }),
      conversation(6, { status: "errored", verdicts: [], claims: null }),
    ];
    const rates = batchRates(list);
    expect(rates).toMatchObject({ conversations: 6, errored: 1, sampled: 5, graded: 4, claimsMissing: 0 });
    expect(rates.rates.hallucination).toMatchObject({ hits: 2, of: 4 });
    expect(rates.rates.hallucination.estimate?.value).toBe(0.5);
    const { lo, hi } = rates.rates.hallucination.estimate ?? { lo: NaN, hi: NaN };
    expect(lo).toBeLessThanOrEqual(0.5);
    expect(hi).toBeGreaterThanOrEqual(0.5);
    expect(isAlert(rates, 0.2)).toBe(true);
    expect(isAlert(rates, 0.5)).toBe(false);
  });

  it("an unknown never counts as clean", () => {
    expect(hallucinated(conversation(1, { claims: null }))).toBeNull();
    expect(hallucinated(conversation(1, { claims: null, verdicts: allPass().map((v) => (v.grader === "fabricated-entity" ? { ...v, pass: false } : v)) }))).toBe(true);
    expect(hallucinated(conversation(1, { verdicts: allPass().map((v) => (v.grader === "fabricated-entity" ? verdict(v.grader, false, true) : v)) }))).toBeNull();
    const rates = batchRates([conversation(1, { claims: null })]);
    expect(rates.rates.hallucination).toEqual({ hits: 0, of: 0, estimate: null });
    expect(rates.claimsMissing).toBe(1);
    expect(isAlert(rates, 0)).toBe(false);
  });
});

describe("a conversation's record", () => {
  it("prices each call at the provider that answered, and keeps the steps", () => {
    const planned = { number: 3, template: task, persona: "pushy-refund" as const };
    const usageOf = { inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 0 };
    const c = toConversation(
      planned,
      {
        status: "finished",
        end: "gave-up",
        endReason: "no",
        error: null,
        turns: 1,
        events: [
          { type: "customer", text: "refund now" },
          { type: "model", step: 1, provider: "b", startedAt: 0, latencyMs: 5, usage: usageOf, cached: false },
          { type: "text", step: 1, text: "Sorry." },
        ],
        trajectory: null,
        customerCalls: [{ provider: "a", usage: usageOf }],
      },
      [
        { provider: "a", prices: { input: 1, cachedInput: 0, output: 0 } },
        { provider: "b", prices: { input: 2, cachedInput: 0, output: 0 } },
      ],
      { startedAt: 0, finishedAt: 1000 },
    );
    expect(c).toMatchObject({ number: 3, templateId: "cancel-99", persona: "pushy-refund", calls: 1, customerCalls: 1, costUsd: 3, sampled: false });
    expect(conversationTrial({ ...c, flags: ["x"] })).toMatchObject({ taskId: "cancel-99", tryNumber: 3, status: "failed", modelLatencyMs: 5, end: "answered" });
  });
});

describe("batch files", () => {
  const dir = mkdtempSync(join(tmpdir(), "verifai-online-files-test-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const meta = (batchId: string, createdAt: string): Omit<Batch, "rates" | "alert"> => ({
    batchId,
    createdAt,
    finishedAt: createdAt,
    datasetVersion: "d1",
    target: { kind: "promoted", name: "v1" },
    agent: { label: "Groq", model: "m", pool: ["groq"], temperature: 0, maxSteps: 8, reasoningEffort: "low" },
    customer: { promptVersion: "v1", temperature: 1, maxTurns: 8 },
    judge: { model: "j", claimsPromptVersion: "v1" },
    sampleShare: 0.5,
    hallucinationThreshold: 0.2,
    stopped: null,
  });

  it("writes a batch, reads it back, lists oldest first, and leaves out a half-written one", () => {
    writeBatch(buildBatch(meta("b2", "2026-10-24T02:00:00.000Z"), [conversation(1)]), [conversation(1)], (t) => t.replaceAll("secret", "[redacted]"), dir);
    writeBatch(buildBatch(meta("b1", "2026-10-24T01:00:00.000Z"), []), [conversation(1, { steps: [{ type: "customer", text: "my secret" }] })], (t) => t.replaceAll("secret", "[redacted]"), dir);
    mkdirSync(join(dir, "b3"));
    writeFileSync(join(dir, "b3", "conversations.jsonl"), "");
    const listing = listBatches(dir);
    expect(listing.batches.map((b) => b.batchId)).toEqual(["b1", "b2"]);
    expect(listing.problems).toEqual([]);
    const read = readBatch("b1", dir);
    expect(read?.conversations[0].steps).toEqual([{ type: "customer", text: "my [redacted]" }]);
    expect(readBatch("b3", dir)).toBeNull();
    expect(readBatch("../x", dir)).toBeNull();
  });
});
