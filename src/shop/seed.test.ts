import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it } from "vitest";
import { getShopToday } from "./db";
import { SHOP_TODAY, writeShop } from "./seed";

const dir = mkdtempSync(join(tmpdir(), "verifai-seed-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("seed", () => {
  it("writes the same file byte for byte every time", () => {
    writeShop(join(dir, "a.db"));
    writeShop(join(dir, "b.db"));
    expect(readFileSync(join(dir, "a.db")).equals(readFileSync(join(dir, "b.db")))).toBe(true);
  });

  it("has the shape the spec asks for", () => {
    const path = join(dir, "shape.db");
    writeShop(path);
    const db = new DatabaseSync(path, { readOnly: true });
    const n = (sql: string) => Number(db.prepare(sql).get()?.n);
    const daysAgo = `julianday('${SHOP_TODAY}') - julianday(delivered_at)`;

    expect(getShopToday(db)).toBe(SHOP_TODAY);
    expect(n("SELECT COUNT(*) n FROM customers")).toBe(30);
    expect(n("SELECT COUNT(*) n FROM orders")).toBe(80);
    for (const status of ["processing", "shipped", "delivered"]) {
      expect(n(`SELECT COUNT(*) n FROM orders WHERE status = '${status}'`)).toBeGreaterThan(0);
    }
    expect(n(`SELECT COUNT(*) n FROM orders WHERE status = 'delivered' AND ${daysAgo} <= 14`)).toBeGreaterThan(0);
    expect(n(`SELECT COUNT(*) n FROM orders WHERE status = 'delivered' AND ${daysAgo} > 14`)).toBeGreaterThan(0);
    expect(n("SELECT COUNT(DISTINCT order_id) n FROM refunds")).toBeGreaterThan(0);
    expect(n("SELECT COUNT(*) n FROM orders WHERE total > 10000")).toBeGreaterThan(0);
    // Partial refunds leave something behind, and totals match their items.
    expect(n("SELECT COUNT(*) n FROM orders o WHERE (SELECT SUM(amount) FROM refunds r WHERE r.order_id = o.id) >= o.total")).toBe(0);
    expect(
      n("SELECT COUNT(*) n FROM orders o WHERE o.total != (SELECT SUM(quantity * unit_price) FROM order_items i WHERE i.order_id = o.id)"),
    ).toBe(0);
    db.close();
  });
});
