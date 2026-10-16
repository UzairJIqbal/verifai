// The arguments grader: every tool call's input passes that tool's schema,
// and every order id and customer id in it exists in the shop.
import { z } from "zod";
import { SHOP_TOOLS, TOOL_NAMES } from "../agent/tools";
import type { Trajectory, Verdict } from "../eval/trajectory";
import { customerIdOf, fails, orderIdOf, passes, toolCalls, type ShopFacts } from "./steps";

export const GRADER = "arguments";

function problemWith(name: string, input: unknown, shop: ShopFacts): string | null {
  const tool = TOOL_NAMES.find((t) => t === name);
  if (!tool) return `${name} isn't one of the shop's tools`;
  const parsed = SHOP_TOOLS[tool].inputSchema.safeParse(input);
  if (!parsed.success) return `${name} input fails its schema: ${z.prettifyError(parsed.error).replace(/\n\s*/g, " ")}`;
  const orderId = orderIdOf(input);
  if (orderId !== null && !shop.orders.has(orderId)) return `${name} names order ${orderId}, which doesn't exist`;
  const customerId = customerIdOf(input);
  if (customerId !== null && !shop.customerIds.has(customerId)) return `${name} names customer ${customerId}, which doesn't exist`;
  return null;
}

export function gradeArguments(trajectory: Trajectory, shop: ShopFacts): Verdict {
  const calls = toolCalls(trajectory.events);
  if (calls.length === 0) return passes(GRADER, "no tool calls to check");
  const bad = calls.flatMap((c) => {
    const problem = problemWith(c.name, c.input, shop);
    return problem === null ? [] : [{ index: c.index, problem }];
  });
  if (bad.length === 0) return passes(GRADER, `all ${calls.length} call(s) have valid inputs naming real ids`);
  const more = bad.length > 1 ? ` (and ${bad.length - 1} more bad call(s))` : "";
  return fails(GRADER, `${bad[0].problem}${more}`, bad[0].index);
}
