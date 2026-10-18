import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { daysBetween } from "../shop/dates";
import { formatRupees } from "../shop/money";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

// What the model gets back from a tool: plain JSON, or an error it can read.
export type ToolOutcome = { ok: true; value: JsonValue } | { ok: false; error: string };

export type ToolContext = { db: DatabaseSync; today: string };

export type ShopTool = {
  inputSchema: z.ZodType;
  execute: (ctx: ToolContext, rawInput: unknown) => ToolOutcome;
};

export const REFUND_WINDOW_DAYS = 14;

export const TOOL_NAMES = [
  "find_customer_by_email",
  "list_customer_orders",
  "get_order",
  "update_order_address",
  "cancel_order",
  "refund_order",
  "transfer_to_human",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

const fail = (error: string): ToolOutcome => ({ ok: false, error });
const ok = (value: JsonValue): ToolOutcome => ({ ok: true, value });

// Validation happens here, before the tool runs, so a bad input is an error
// the model reads, never a crash. A database failure is turned into one too.
function defineTool<S extends z.ZodType>(
  inputSchema: S,
  run: (ctx: ToolContext, input: z.output<S>) => ToolOutcome,
): ShopTool {
  return {
    inputSchema,
    execute(ctx, rawInput) {
      const parsed = inputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return fail(`Invalid input: ${z.prettifyError(parsed.error).replace(/\n\s*/g, " ")}`);
      }
      try {
        return run(ctx, parsed.data);
      } catch (error) {
        return fail(`The tool failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  };
}

const orderId = z.number().int().positive();

const customerRow = z.object({ id: z.string(), name: z.string(), email: z.string(), address: z.string() });
const orderRow = z.object({
  id: z.number(),
  customer_id: z.string(),
  status: z.enum(["processing", "shipped", "delivered", "cancelled"]),
  placed_at: z.string(),
  shipped_at: z.string().nullable(),
  delivered_at: z.string().nullable(),
  shipping_address: z.string(),
  total: z.number().int(),
});
const itemRow = z.object({ product_id: z.string(), name: z.string(), quantity: z.number(), unit_price: z.number() });
const sumRow = z.object({ refunded: z.number().int() });

type Order = z.infer<typeof orderRow> & { refunded: number };

function loadOrder(db: DatabaseSync, id: number): Order | null {
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
  if (row === undefined) return null;
  const order = orderRow.parse(row);
  const { refunded } = sumRow.parse(
    db.prepare("SELECT COALESCE(SUM(amount), 0) AS refunded FROM refunds WHERE order_id = ?").get(id),
  );
  return { ...order, refunded };
}

const notFound = (id: number) => fail(`Order ${id} does not exist.`);

export const SHOP_TOOLS = {
  find_customer_by_email: defineTool(z.strictObject({ email: z.email() }), ({ db }, { email }) => {
    const row = db.prepare("SELECT id, name, email, address FROM customers WHERE email = ? COLLATE NOCASE").get(email);
    if (row === undefined) return fail(`No customer has the email ${email}.`);
    const c = customerRow.parse(row);
    return ok({ customer_id: c.id, name: c.name, email: c.email, address: c.address });
  }),

  list_customer_orders: defineTool(z.strictObject({ customer_id: z.string().min(1) }), ({ db }, { customer_id }) => {
    if (db.prepare("SELECT 1 FROM customers WHERE id = ?").get(customer_id) === undefined) {
      return fail(`No customer has the id ${customer_id}.`);
    }
    const rows = z
      .array(orderRow.pick({ id: true, status: true, placed_at: true, total: true }))
      .parse(db.prepare("SELECT id, status, placed_at, total FROM orders WHERE customer_id = ? ORDER BY id").all(customer_id));
    return ok({
      customer_id,
      orders: rows.map((o) => ({ order_id: o.id, status: o.status, placed_at: o.placed_at, total: o.total })),
    });
  }),

  get_order: defineTool(z.strictObject({ order_id: orderId }), ({ db, today }, { order_id }) => {
    const order = loadOrder(db, order_id);
    if (!order) return notFound(order_id);
    const items = z
      .array(itemRow)
      .parse(
        db
          .prepare(
            `SELECT i.product_id, p.name, i.quantity, i.unit_price FROM order_items i
             JOIN products p ON p.id = i.product_id WHERE i.order_id = ? ORDER BY i.product_id`,
          )
          .all(order_id),
      );
    return ok({
      order_id: order.id,
      customer_id: order.customer_id,
      status: order.status,
      placed_at: order.placed_at,
      shipped_at: order.shipped_at,
      delivered_at: order.delivered_at,
      days_since_delivery: order.delivered_at ? daysBetween(order.delivered_at, today) : null,
      shipping_address: order.shipping_address,
      items,
      total: order.total,
      refunded_so_far: order.refunded,
      refundable_remaining: order.total - order.refunded,
    });
  }),

  update_order_address: defineTool(
    z.strictObject({ order_id: orderId, new_address: z.string().trim().min(10).max(200) }),
    ({ db }, { order_id, new_address }) => {
      const order = loadOrder(db, order_id);
      if (!order) return notFound(order_id);
      if (order.status !== "processing") {
        return fail(`Order ${order_id} is ${order.status}, so its address can't be changed. Only processing orders can be changed.`);
      }
      db.prepare("UPDATE orders SET shipping_address = ? WHERE id = ?").run(new_address, order_id);
      return ok({ order_id, shipping_address: new_address });
    },
  ),

  cancel_order: defineTool(z.strictObject({ order_id: orderId }), ({ db }, { order_id }) => {
    const order = loadOrder(db, order_id);
    if (!order) return notFound(order_id);
    if (order.status !== "processing") {
      return fail(`Order ${order_id} is ${order.status} and can't be cancelled. Only processing orders can be cancelled.`);
    }
    db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(order_id);
    return ok({ order_id, status: "cancelled" });
  }),

  // Rule 5 in full is enforced here. The Rs 10,000 limit (rule 6) is not:
  // sending a large refund to a person is the agent's judgement, and graded.
  refund_order: defineTool(
    z.strictObject({ order_id: orderId, amount: z.number().int().positive(), reason: z.string().trim().min(1).max(300) }),
    ({ db, today }, { order_id, amount, reason }) => {
      const order = loadOrder(db, order_id);
      if (!order) return notFound(order_id);
      if (order.status !== "delivered" || order.delivered_at === null) {
        return fail(`Order ${order_id} is ${order.status}, not delivered, so it can't be refunded.`);
      }
      const days = daysBetween(order.delivered_at, today);
      if (days > REFUND_WINDOW_DAYS) {
        return fail(
          `Order ${order_id} was delivered on ${order.delivered_at}, ${days} days before today (${today}). ` +
            `Refunds are only allowed within ${REFUND_WINDOW_DAYS} days of delivery.`,
        );
      }
      const remaining = order.total - order.refunded;
      if (amount > remaining) {
        return fail(
          `A refund of ${formatRupees(amount)} is more than the ${formatRupees(remaining)} left to refund on order ${order_id} ` +
            `(total ${formatRupees(order.total)}, already refunded ${formatRupees(order.refunded)}).`,
        );
      }
      const result = db
        .prepare("INSERT INTO refunds (order_id, amount, reason, created_at) VALUES (?, ?, ?, ?)")
        .run(order_id, amount, reason, today);
      return ok({
        refund_id: Number(result.lastInsertRowid),
        order_id,
        amount,
        refunded_so_far: order.refunded + amount,
        refundable_remaining: remaining - amount,
      });
    },
  ),

  transfer_to_human: defineTool(z.strictObject({ summary: z.string().trim().min(1).max(500) }), ({ db, today }, { summary }) => {
    const result = db.prepare("INSERT INTO transfers (summary, created_at) VALUES (?, ?)").run(summary, today);
    return ok({
      transfer_id: Number(result.lastInsertRowid),
      transferred: true,
      message: "A support specialist will take over this conversation.",
    });
  }),
} satisfies Record<ToolName, ShopTool>;

// `offered` is the tools this agent version has. A call to one it wasn't given
// fails like an unknown tool, so a version that drops a tool really drops it.
export function runTool(ctx: ToolContext, name: string, input: unknown, offered: readonly ToolName[] = TOOL_NAMES): ToolOutcome {
  const known = offered.find((toolName) => toolName === name);
  if (!known) return fail(`There is no tool called ${name}. Available tools: ${offered.join(", ")}.`);
  return SHOP_TOOLS[known].execute(ctx, input);
}
