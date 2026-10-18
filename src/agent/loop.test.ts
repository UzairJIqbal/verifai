import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelMessage } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterAll, describe, expect, it } from "vitest";
import { loadConfig } from "../config";
import { getShopToday, openFreshShop } from "../shop/db";
import { writeShop } from "../shop/seed";
import { runAgentTurn, type AgentEvent, type AgentSetup } from "./loop";
import { loadAgentVersion } from "./versions";

const dir = mkdtempSync(join(tmpdir(), "verifai-loop-test-"));
const seedPath = join(dir, "shop.db");
writeShop(seedPath);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};
const toolCall = (id: string, toolName: string, input: unknown) => ({
  content: [{ type: "tool-call" as const, toolCallId: id, toolName, input: JSON.stringify(input) }],
  finishReason: { unified: "tool-calls" as const, raw: "tool-calls" },
  usage,
  warnings: [],
});
const reply = (text: string) => ({
  content: [{ type: "text" as const, text }],
  finishReason: { unified: "stop" as const, raw: "stop" },
  usage,
  warnings: [],
});

function setupWith(model: MockLanguageModelV4, today: string): AgentSetup {
  const config = loadConfig();
  return { model, provider: "test", temperature: 0, maxSteps: config.agent.maxSteps, stepTimeoutMs: 1000, reasoningEffort: "low", version: loadAgentVersion(config, today) };
}

describe("agent loop", () => {
  it("runs the tools itself, reports each step, and stops on a reply", async () => {
    const shop = openFreshShop(seedPath);
    const today = getShopToday(shop.db);
    const model = new MockLanguageModelV4({
      doGenerate: [
        toolCall("a", "get_order", { order_id: "1001" }),
        toolCall("b", "get_order", { order_id: 1001 }),
        reply("Your order is processing."),
      ],
    });
    const events: AgentEvent[] = [];
    const messages: ModelMessage[] = [{ role: "user", content: "Where is order 1001?" }];

    const result = await runAgentTurn(setupWith(model, today), { db: shop.db, today }, messages, (e) => events.push(e));
    shop.dispose();

    expect(result).toEqual({ stopReason: "replied", steps: 3, reply: "Your order is processing." });
    expect(events.map((e) => e.type)).toEqual(["model", "tool-call", "tool-result", "model", "tool-call", "tool-result", "model", "text"]);
    // The bad input became an error the model reads on its next step.
    const first = events[2];
    expect(first.type === "tool-result" && !first.outcome.ok && first.outcome.error).toMatch(/Invalid input/);
    expect(JSON.stringify(model.doGenerateCalls[1].prompt)).toContain("Invalid input");
    // Exactly one tool message per tool step, all of them ours.
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "tool", "assistant", "tool", "assistant"]);
    // The prompt carries the shop's date and the policy.
    expect(JSON.stringify(model.doGenerateCalls[0].prompt)).toContain(today);
    expect(JSON.stringify(model.doGenerateCalls[0].prompt)).toContain("Large refunds go to a person");
  });

  it("doesn't offer a tool the version leaves out, and a call to it fails", async () => {
    const shop = openFreshShop(seedPath);
    const today = getShopToday(shop.db);
    const order = shop.db.prepare("SELECT id FROM orders WHERE status = 'processing' LIMIT 1").get() as { id: number };
    const model = new MockLanguageModelV4({
      doGenerate: [toolCall("a", "cancel_order", { order_id: order.id }), reply("Sorry, I can't cancel it.")],
    });
    const setup = setupWith(model, today);
    const rest = { ...setup.version.toolDescriptions };
    delete rest.cancel_order;
    const events: AgentEvent[] = [];
    await runAgentTurn({ ...setup, version: { ...setup.version, toolDescriptions: rest } }, { db: shop.db, today }, [{ role: "user", content: "Cancel it" }], (e) =>
      events.push(e),
    );
    const status = shop.db.prepare("SELECT status FROM orders WHERE id = ?").get(order.id) as { status: string };
    shop.dispose();

    const offered = (model.doGenerateCalls[0].tools ?? []).map((t) => t.name);
    expect(offered).not.toContain("cancel_order");
    expect(offered).toContain("get_order");
    const result = events.find((e) => e.type === "tool-result");
    expect(result?.type === "tool-result" && !result.outcome.ok && result.outcome.error).toMatch(/no tool called cancel_order/);
    expect(status.status).toBe("processing");
  });

  it("stops at the step limit", async () => {
    const shop = openFreshShop(seedPath);
    const today = getShopToday(shop.db);
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => toolCall(`c${++calls}`, "get_order", { order_id: 1001 }),
    });
    const setup = setupWith(model, today);
    const result = await runAgentTurn(setup, { db: shop.db, today }, [{ role: "user", content: "hi" }], () => {});
    shop.dispose();

    expect(result.stopReason).toBe("step-limit");
    expect(model.doGenerateCalls).toHaveLength(setup.maxSteps);
  });

  it("gives up on a model call that never answers", async () => {
    const shop = openFreshShop(seedPath);
    const today = getShopToday(shop.db);
    const model = new MockLanguageModelV4({
      doGenerate: ({ abortSignal }) =>
        new Promise((_, reject) => abortSignal?.addEventListener("abort", () => reject(abortSignal.reason))),
    });
    const setup = { ...setupWith(model, today), stepTimeoutMs: 50 };
    const turn = runAgentTurn(setup, { db: shop.db, today }, [{ role: "user", content: "hi" }], () => {});
    await expect(turn).rejects.toMatchObject({ name: "TimeoutError" });
    shop.dispose();
  });
});
