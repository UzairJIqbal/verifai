// Builds the seeded shop. `pnpm seed` writes data/shop.db; `pnpm seed <path>`
// writes somewhere else, which is how you check two runs are byte-identical.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { SEED_DB_PATH } from "../src/shop/db";
import { SHOP_TODAY, writeShop } from "../src/shop/seed";
import { formatRupees } from "../src/shop/money";

const target = process.argv[2] ? resolve(process.argv[2]) : SEED_DB_PATH;
mkdirSync(dirname(target), { recursive: true });
writeShop(target);

const db = new DatabaseSync(target, { readOnly: true });
const count = (sql: string): number => z.object({ n: z.number() }).parse(db.prepare(sql).get()).n;

const exampleSchema = z.object({ id: z.number(), email: z.string(), total: z.number(), delivered_at: z.string().nullable() });
const example = (where: string): string => {
  const row = db
    .prepare(
      `SELECT o.id, c.email, o.total, o.delivered_at FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE ${where} ORDER BY o.id LIMIT 1`,
    )
    .get();
  if (row === undefined) return "none in the seed";
  const o = exampleSchema.parse(row);
  return `order ${o.id} · ${o.email} · ${formatRupees(o.total)}${o.delivered_at ? ` · delivered ${o.delivered_at}` : ""}`;
};
const refunded = "(SELECT COALESCE(SUM(amount), 0) FROM refunds r WHERE r.order_id = o.id)";
const daysAgo = `CAST(julianday('${SHOP_TODAY}') - julianday(o.delivered_at) AS INTEGER)`;

console.log(`Seeded shop written to ${target}`);
console.log(`  today ${SHOP_TODAY} · ${count("SELECT COUNT(*) n FROM customers")} customers · ${count("SELECT COUNT(*) n FROM orders")} orders`);
console.log(
  `  processing ${count("SELECT COUNT(*) n FROM orders WHERE status='processing'")}` +
    ` · shipped ${count("SELECT COUNT(*) n FROM orders WHERE status='shipped'")}` +
    ` · delivered ${count("SELECT COUNT(*) n FROM orders WHERE status='delivered'")}` +
    ` (${count(`SELECT COUNT(*) n FROM orders o WHERE status='delivered' AND ${daysAgo} <= 14`)} within 14 days)`,
);
console.log(
  `  partly refunded ${count("SELECT COUNT(DISTINCT order_id) n FROM refunds")}` +
    ` · over Rs 10,000 ${count("SELECT COUNT(*) n FROM orders WHERE total > 10000")}`,
);
console.log("\nHandy for trying the chat:");
console.log(`  processing           ${example("o.status = 'processing'")}`);
console.log(`  shipped              ${example("o.status = 'shipped'")}`);
console.log(`  delivered 20 days    ${example(`o.status = 'delivered' AND ${daysAgo} = 20`)}`);
console.log(`  refundable > 10,000  ${example(`o.status = 'delivered' AND ${daysAgo} <= 14 AND o.total - ${refunded} > 10000`)}`);
console.log(`  partly refunded      ${example(`o.status = 'delivered' AND ${daysAgo} <= 14 AND ${refunded} > 0`)}`);
db.close();
