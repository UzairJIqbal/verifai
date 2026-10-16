// Reads the facts the graders need from the seeded shop, once per command.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { getShopToday, openFreshShop, SEED_DB_PATH } from "../shop/db";
import { ORDER_STATUSES, type ShopFacts } from "./steps";

const orderRow = z.object({
  id: z.number().int(),
  customer_id: z.string(),
  status: z.enum(ORDER_STATUSES),
  delivered_at: z.string().nullable(),
  total: z.number().int(),
  refunded: z.number().int(),
});

export function readShopFacts(db: DatabaseSync, today: string): ShopFacts {
  const customers = z.array(z.object({ id: z.string() })).parse(db.prepare("SELECT id FROM customers").all());
  const orders = z.array(orderRow).parse(
    db
      .prepare(
        `SELECT o.id, o.customer_id, o.status, o.delivered_at, o.total, COALESCE(SUM(r.amount), 0) AS refunded
         FROM orders o LEFT JOIN refunds r ON r.order_id = o.id GROUP BY o.id`,
      )
      .all(),
  );
  return {
    today,
    customerIds: new Set(customers.map((c) => c.id)),
    orders: new Map(orders.map((o) => [o.id, { customerId: o.customer_id, status: o.status, deliveredAt: o.delivered_at, total: o.total, refunded: o.refunded }])),
  };
}

export function loadShopFacts(seedPath: string = SEED_DB_PATH): ShopFacts {
  const shop = openFreshShop(seedPath);
  try {
    return readShopFacts(shop.db, getShopToday(shop.db));
  } finally {
    shop.dispose();
  }
}
