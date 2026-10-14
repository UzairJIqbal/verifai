// Read-only views of a shop for the playground's side panel and customer picker.
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { SEED_DB_PATH } from "../shop/db";
import type { OrderSnapshot, ShopSnapshot } from "./protocol";

const orderRow = z.object({
  id: z.number(),
  customer_id: z.string(),
  status: z.enum(["processing", "shipped", "delivered", "cancelled"]),
  placed_at: z.string(),
  delivered_at: z.string().nullable(),
  total: z.number().int(),
  refunded: z.number().int(),
});
const customerRow = z.object({ id: z.string(), name: z.string(), email: z.string() });

const ORDER_SQL = `
  SELECT o.id, o.customer_id, o.status, o.placed_at, o.delivered_at, o.total,
         (SELECT COALESCE(SUM(amount), 0) FROM refunds r WHERE r.order_id = o.id) AS refunded
  FROM orders o`;

function toSnapshot(row: unknown): OrderSnapshot {
  const o = orderRow.parse(row);
  return {
    id: o.id,
    customerId: o.customer_id,
    status: o.status,
    placedAt: o.placed_at,
    deliveredAt: o.delivered_at,
    total: o.total,
    refunded: o.refunded,
  };
}

export function readShopSnapshot(db: DatabaseSync, query: { email?: string; orderId?: number }): ShopSnapshot {
  let customer: ShopSnapshot["customer"] = null;
  if (query.email) {
    const row = db.prepare("SELECT id, name, email FROM customers WHERE email = ? COLLATE NOCASE").get(query.email);
    if (row !== undefined) {
      const c = customerRow.parse(row);
      const orders = db.prepare(`${ORDER_SQL} WHERE o.customer_id = ? ORDER BY o.id`).all(c.id).map(toSnapshot);
      customer = { ...c, orders };
    }
  }
  const orderRowFound = query.orderId === undefined ? undefined : db.prepare(`${ORDER_SQL} WHERE o.id = ?`).get(query.orderId);
  return { customer, order: orderRowFound === undefined ? null : toSnapshot(orderRowFound) };
}

export type PickableCustomer = { email: string; name: string; processingOrderId: number };

// A short list for the picker: customers who have an order that can still be
// cancelled, since that's the first thing worth trying in the playground.
export function listPickableCustomers(seedPath: string = SEED_DB_PATH, limit = 8): PickableCustomer[] {
  const db = new DatabaseSync(seedPath, { readOnly: true });
  try {
    const rows = db
      .prepare(
        `SELECT c.email, c.name, MIN(o.id) AS processing_order_id
         FROM customers c JOIN orders o ON o.customer_id = c.id
         WHERE o.status = 'processing'
         GROUP BY c.id ORDER BY c.id LIMIT ?`,
      )
      .all(limit);
    return z
      .array(z.object({ email: z.string(), name: z.string(), processing_order_id: z.number() }))
      .parse(rows)
      .map((r) => ({ email: r.email, name: r.name, processingOrderId: r.processing_order_id }));
  } finally {
    db.close();
  }
}
