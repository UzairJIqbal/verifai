// One try of a task: the customer's first message, then the next canned reply
// after every agent turn until they run out, on a fresh copy of the shop.
import type { ModelMessage } from "ai";
import { getShopToday, openFreshShop, SEED_DB_PATH } from "../shop/db";
import { diffShops, dumpShop } from "../shop/diff";
import { runAgentTurn, type AgentSetup } from "../agent/loop";
import { runTool } from "../agent/tools";
import type { Task } from "../tasks/schema";
import type { ConversationEnd, Trajectory, TrajectoryEvent } from "./trajectory";

export async function runTaskConversation(
  setup: AgentSetup,
  task: Task,
  onEvent: (event: TrajectoryEvent) => void = () => {},
  seedPath: string = SEED_DB_PATH,
): Promise<Trajectory> {
  const shop = openFreshShop(seedPath);
  try {
    const ctx = { db: shop.db, today: getShopToday(shop.db) };
    const before = dumpShop(shop.db);
    const events: TrajectoryEvent[] = [];
    const record = (event: TrajectoryEvent) => {
      events.push(event);
      onEvent(event);
    };
    const messages: ModelMessage[] = [];
    const replies = [...task.canned_replies];

    let customer = task.first_message;
    let end: ConversationEnd;
    for (;;) {
      record({ type: "customer", text: customer });
      messages.push({ role: "user", content: customer });
      const turn = await runAgentTurn(setup, ctx, messages, record);
      if (turn.stopReason === "step-limit") {
        end = "step-limit";
        break;
      }
      // The customer answers every turn, not only ones with a "?": dataset v1
      // waited for a question mark, so "Please confirm you'd like me to
      // proceed." got no answer and a polite agent failed for its punctuation.
      const next = replies.shift();
      if (next === undefined) {
        end = "answered";
        break;
      }
      customer = next;
    }

    return { events, end, changes: diffShops(before, dumpShop(shop.db)) };
  } finally {
    shop.dispose();
  }
}

// The task's reference tool calls, run by hand on a fresh shop. Used to check
// that a task's expected changes are right. Any call that errors is reported,
// since a reference solution never should.
export function runReference(task: Task, seedPath: string = SEED_DB_PATH): { trajectory: Trajectory; errors: string[] } {
  const shop = openFreshShop(seedPath);
  try {
    const ctx = { db: shop.db, today: getShopToday(shop.db) };
    const before = dumpShop(shop.db);
    const events: TrajectoryEvent[] = [];
    const errors: string[] = [];
    task.reference.forEach((call, i) => {
      const toolCallId = `ref-${i + 1}`;
      events.push({ type: "tool-call", step: i + 1, toolCallId, toolName: call.tool, input: call.input });
      const outcome = runTool(ctx, call.tool, call.input);
      events.push({ type: "tool-result", step: i + 1, toolCallId, toolName: call.tool, outcome, startedAt: 0, latencyMs: 0 });
      if (!outcome.ok) errors.push(`${call.tool}: ${outcome.error}`);
    });
    return { trajectory: { events, end: "answered", changes: diffShops(before, dumpShop(shop.db)) }, errors };
  } finally {
    shop.dispose();
  }
}
