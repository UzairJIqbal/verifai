// What the trajectory graders read from a try, pulled out once: its tool
// calls with their results, what the customer said and what the agent said.
// Indexes are positions in the try's events, which are the same as the
// positions of its recorded steps, so a verdict can point at one.
import { z } from "zod";
import type { ToolOutcome } from "../agent/tools";
import type { Trajectory, TrajectoryEvent, Verdict } from "../eval/trajectory";

export const passes = (grader: string, reason: string, step: number | null = null): Verdict => ({ grader, pass: true, reason, step, ungraded: false });
export const fails = (grader: string, reason: string, step: number | null): Verdict => ({ grader, pass: false, reason, step, ungraded: false });
// Couldn't run on this try. Never a pass, and counted apart.
export const ungraded = (grader: string, reason: string): Verdict => ({ grader, pass: false, reason: `couldn't grade: ${reason}`, step: null, ungraded: true });

export type ToolCall = {
  index: number;
  name: string;
  input: unknown;
  // Null when the call has no result in the trajectory.
  outcome: ToolOutcome | null;
};

export function toolCalls(events: TrajectoryEvent[]): ToolCall[] {
  const results = new Map<string, ToolOutcome>();
  for (const e of events) if (e.type === "tool-result") results.set(e.toolCallId, e.outcome);
  return events.flatMap((e, index) => (e.type === "tool-call" ? [{ index, name: e.toolName, input: e.input, outcome: results.get(e.toolCallId) ?? null }] : []));
}

// The graders that judge a call by what it did can't run on a call that never
// got a result.
export const missingResult = (calls: ToolCall[]): ToolCall | undefined => calls.find((c) => c.outcome === null);

export type Said = { index: number; text: string };

export const customerMessages = (t: Trajectory): Said[] => t.events.flatMap((e, index) => (e.type === "customer" ? [{ index, text: e.text }] : []));
export const agentTexts = (t: Trajectory): Said[] => t.events.flatMap((e, index) => (e.type === "text" ? [{ index, text: e.text }] : []));

const withOrderId = z.object({ order_id: z.number().int() });
const withAmount = z.object({ amount: z.number().int() });
const withCustomerId = z.object({ customer_id: z.string() });

export const orderIdOf = (input: unknown): number | null => withOrderId.safeParse(input).data?.order_id ?? null;
export const amountOf = (input: unknown): number | null => withAmount.safeParse(input).data?.amount ?? null;
export const customerIdOf = (input: unknown): string | null => withCustomerId.safeParse(input).data?.customer_id ?? null;

// A successful call's value, when it has a customer_id in it.
export const customerIdFound = (call: ToolCall): string | null => (call.outcome?.ok ? customerIdOf(call.outcome.value) : null);

export const succeeded = (call: ToolCall): boolean => call.outcome?.ok === true;

// The order tools that change something, and the policy rules they come under.
export const ACTION_TOOLS = ["cancel_order", "refund_order", "update_order_address"] as const;
export const isAction = (name: string): boolean => (ACTION_TOOLS as readonly string[]).includes(name);

// Every call that changes the shop. A repeat after one of these isn't a loop:
// the agent may be checking what it just did.
export const WRITE_TOOLS = [...ACTION_TOOLS, "transfer_to_human"] as const;
export const isWrite = (name: string): boolean => (WRITE_TOOLS as readonly string[]).includes(name);

export const ORDER_STATUSES = ["processing", "shipped", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderFacts = { customerId: string; status: OrderStatus; deliveredAt: string | null; total: number; refunded: number };

// What the graders need to know about the seeded shop, read once. Graders
// stay pure functions: they're handed these, they never open a database.
export type ShopFacts = { today: string; customerIds: ReadonlySet<string>; orders: ReadonlyMap<number, OrderFacts> };

// Each order as it stands just before each call: the seed, plus the cancels
// and refunds that succeeded earlier in the same try. Rules 3 to 6 are about
// the order at the moment the agent acted on it, not as it was seeded.
export function ordersBeforeEachCall(calls: ToolCall[], shop: ShopFacts): Map<number, OrderFacts>[] {
  const now = new Map([...shop.orders].map(([id, o]) => [id, { ...o }]));
  return calls.map((call) => {
    const snapshot = new Map([...now].map(([id, o]) => [id, { ...o }]));
    const id = orderIdOf(call.input);
    const order = id === null ? undefined : now.get(id);
    if (order && succeeded(call)) {
      if (call.name === "cancel_order") order.status = "cancelled";
      if (call.name === "refund_order") order.refunded += amountOf(call.input) ?? 0;
    }
    return snapshot;
  });
}
