// Hand-built trajectories for the grader tests: a script of what the customer
// says, what the agent says and which tools it calls. The calls run for real
// on a fresh copy of the given shop, so their results are the shop's own.
import { runTool } from "../agent/tools";
import type { Trajectory, TrajectoryEvent } from "../eval/trajectory";
import { getShopToday, openFreshShop } from "../shop/db";

export type Line = { customer: string } | { say: string } | { call: string; input: unknown } | { callWithNoResult: string; input: unknown };

export function scripted(seedPath: string, lines: Line[]): Trajectory {
  const shop = openFreshShop(seedPath);
  try {
    const ctx = { db: shop.db, today: getShopToday(shop.db) };
    const events: TrajectoryEvent[] = [];
    let step = 0;
    lines.forEach((line, i) => {
      if ("customer" in line) {
        step = 0;
        events.push({ type: "customer", text: line.customer });
      } else if ("say" in line) {
        events.push({ type: "text", step: ++step, text: line.say });
      } else {
        const toolName = "call" in line ? line.call : line.callWithNoResult;
        const toolCallId = `call-${i}`;
        events.push({ type: "tool-call", step: ++step, toolCallId, toolName, input: line.input });
        if ("call" in line) events.push({ type: "tool-result", step, toolCallId, toolName, outcome: runTool(ctx, toolName, line.input), startedAt: 0, latencyMs: 0 });
      }
    });
    return { events, end: "answered", changes: [] };
  } finally {
    shop.dispose();
  }
}

// The index of the nth (from 0) tool call to `name`, as a verdict points at it.
export function callIndex(t: Trajectory, name: string, nth = 0): number {
  const found = t.events.flatMap((e, i) => (e.type === "tool-call" && e.toolName === name ? [i] : []))[nth];
  if (found === undefined) throw new Error(`No call ${nth} to ${name} in the script.`);
  return found;
}
