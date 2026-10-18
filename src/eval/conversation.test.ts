import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockLanguageModelV4 } from "ai/test";
import { afterAll, describe, expect, it } from "vitest";
import { loadConfig } from "../config";
import { writeShop } from "../shop/seed";
import { loadAgentVersion } from "../agent/versions";
import type { AgentSetup } from "../agent/loop";
import { taskSchema } from "../tasks/schema";
import { runTaskConversation } from "./conversation";

const dir = mkdtempSync(join(tmpdir(), "verifai-conversation-test-"));
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

function setupWith(model: MockLanguageModelV4): AgentSetup {
  const config = loadConfig();
  return { model, provider: "test", temperature: 0, maxSteps: 3, stepTimeoutMs: 1000, reasoningEffort: "low", version: loadAgentVersion(config, "2026-03-15") };
}

const task = taskSchema.parse({
  id: "cancel-99",
  split: "dev",
  category: "cancel",
  difficulty: "easy",
  adversarial: false,
  note: "test",
  first_message: "Hi, my email is esha.qureshi@example.com. Please cancel order 1005.",
  canned_replies: ["Yes, please go ahead."],
  expected: { changes: [{ op: "update", table: "orders", key: { id: 1005 }, set: { status: "cancelled" } }] },
  reference: [],
});

describe("task conversation", () => {
  it("sends a canned reply after the agent's turn, and records the shop's changes", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: [reply("Shall I cancel order 1005?"), toolCall("a", "cancel_order", { order_id: 1005 }), reply("Done, it's cancelled.")],
    });
    const trajectory = await runTaskConversation(setupWith(model), task, undefined, seedPath);
    expect(trajectory.end).toBe("answered");
    expect(trajectory.events.filter((e) => e.type === "customer").map((e) => e.type === "customer" && e.text)).toEqual([
      task.first_message,
      "Yes, please go ahead.",
    ]);
    expect(trajectory.changes).toEqual([
      { kind: "update", table: "orders", key: { id: 1005 }, before: { status: "processing" }, after: { status: "cancelled" } },
    ]);
  });

  it("answers a turn with no question mark too", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: [reply("Please confirm you'd like me to cancel order 1005."), toolCall("a", "cancel_order", { order_id: 1005 }), reply("Done.")],
    });
    const trajectory = await runTaskConversation(setupWith(model), task, undefined, seedPath);
    expect(trajectory.events.filter((e) => e.type === "customer")).toHaveLength(2);
    expect(trajectory.changes).toHaveLength(1);
  });

  it("ends after the agent's turn once no canned replies are left", async () => {
    const model = new MockLanguageModelV4({ doGenerate: [reply("Shall I?"), reply("Are you sure?")] });
    const trajectory = await runTaskConversation(setupWith(model), task, undefined, seedPath);
    expect(trajectory.end).toBe("answered");
    expect(trajectory.events.filter((e) => e.type === "customer")).toHaveLength(2);
    expect(trajectory.changes).toEqual([]);
  });

  it("ends at the step limit", async () => {
    const call = toolCall("a", "get_order", { order_id: 1005 });
    const model = new MockLanguageModelV4({ doGenerate: [call, call, call] });
    expect((await runTaskConversation(setupWith(model), task, undefined, seedPath)).end).toBe("step-limit");
  });
});
