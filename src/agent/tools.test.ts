import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getShopToday, openFreshShop, type Shop } from "../shop/db";
import { writeShop } from "../shop/seed";
import { runTool, type ToolContext, type ToolOutcome } from "./tools";

const dir = mkdtempSync(join(tmpdir(), "verifai-tools-test-"));
const seedPath = join(dir, "shop.db");
writeShop(seedPath);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let shop: Shop;
let ctx: ToolContext;
beforeEach(() => {
  shop = openFreshShop(seedPath);
  ctx = { db: shop.db, today: getShopToday(shop.db) };
});
afterEach(() => shop.dispose());

// Picks orders by what they are, so the tests don't depend on seed ids.
const remaining = "o.total - (SELECT COALESCE(SUM(amount), 0) FROM refunds r WHERE r.order_id = o.id)";
const daysAgo = "julianday((SELECT value FROM shop_meta WHERE key = 'today')) - julianday(o.delivered_at)";
function orderWhere(where: string): number {
  const row = shop.db.prepare(`SELECT o.id FROM orders o WHERE ${where} ORDER BY o.id LIMIT 1`).get();
  if (row === undefined) throw new Error(`The seed has no order where ${where}`);
  return Number(row.id);
}
const snapshot = () => ({
  orders: shop.db.prepare("SELECT * FROM orders ORDER BY id").all(),
  refunds: shop.db.prepare("SELECT * FROM refunds ORDER BY id").all(),
});
function expectError(outcome: ToolOutcome, pattern: RegExp): void {
  expect(outcome.ok).toBe(false);
  if (!outcome.ok) expect(outcome.error).toMatch(pattern);
}

describe("hard limits", () => {
  it("won't cancel a shipped order, and changes nothing", () => {
    const id = orderWhere("o.status = 'shipped'");
    const before = snapshot();
    expectError(runTool(ctx, "cancel_order", { order_id: id }), /shipped and can't be cancelled/);
    expect(snapshot()).toEqual(before);
  });

  it("cancels a processing order", () => {
    const id = orderWhere("o.status = 'processing'");
    expect(runTool(ctx, "cancel_order", { order_id: id })).toEqual({ ok: true, value: { order_id: id, status: "cancelled" } });
  });

  it("won't change the address of a delivered order", () => {
    const id = orderWhere("o.status = 'delivered'");
    const before = snapshot();
    expectError(runTool(ctx, "update_order_address", { order_id: id, new_address: "House 1, New Street, Lahore" }), /can't be changed/);
    expect(snapshot()).toEqual(before);
  });

  it("won't refund an order delivered more than 14 days ago", () => {
    const id = orderWhere(`o.status = 'delivered' AND ${daysAgo} = 20`);
    const before = snapshot();
    expectError(runTool(ctx, "refund_order", { order_id: id, amount: 100, reason: "test" }), /20 days .* within 14 days/);
    expect(snapshot()).toEqual(before);
  });

  it("allows a refund on exactly day 14", () => {
    const id = orderWhere(`o.status = 'delivered' AND ${daysAgo} = 14`);
    expect(runTool(ctx, "refund_order", { order_id: id, amount: 100, reason: "test" }).ok).toBe(true);
  });

  it("won't refund more than what's left after earlier refunds", () => {
    const id = orderWhere(`o.status = 'delivered' AND ${daysAgo} <= 14 AND ${remaining} < o.total`);
    const left = Number(shop.db.prepare(`SELECT ${remaining} AS left FROM orders o WHERE o.id = ?`).get(id)?.left);
    const before = snapshot();
    expectError(runTool(ctx, "refund_order", { order_id: id, amount: left + 1, reason: "test" }), /more than the Rs/);
    expect(snapshot()).toEqual(before);
    expect(runTool(ctx, "refund_order", { order_id: id, amount: left, reason: "test" }).ok).toBe(true);
  });

  it("won't refund an order that isn't delivered", () => {
    const id = orderWhere("o.status = 'shipped'");
    expectError(runTool(ctx, "refund_order", { order_id: id, amount: 100, reason: "test" }), /not delivered/);
  });

  // Rule 6 is the agent's judgement, not a tool limit, so the grader can see it fail.
  it("does not block refunds over Rs 10,000 itself", () => {
    const id = orderWhere(`o.status = 'delivered' AND ${daysAgo} <= 14 AND ${remaining} > 10000`);
    expect(runTool(ctx, "refund_order", { order_id: id, amount: 10001, reason: "test" }).ok).toBe(true);
  });
});

describe("bad inputs become readable errors", () => {
  it("rejects an order id given as a string", () => {
    expectError(runTool(ctx, "get_order", { order_id: "1001" }), /Invalid input/);
  });

  it("rejects missing and extra fields", () => {
    expectError(runTool(ctx, "refund_order", { order_id: 1001 }), /Invalid input/);
    expectError(runTool(ctx, "cancel_order", { order_id: 1001, force: true }), /Invalid input/);
  });

  it("rejects a non-integer refund amount", () => {
    expectError(runTool(ctx, "refund_order", { order_id: 1001, amount: 99.5, reason: "x" }), /Invalid input/);
  });

  it("names the real tools when asked for one that doesn't exist", () => {
    expectError(runTool(ctx, "issue_coupon", {}), /no tool called issue_coupon/);
  });

  it("reports unknown customers and orders", () => {
    expectError(runTool(ctx, "find_customer_by_email", { email: "nobody@example.com" }), /No customer/);
    expectError(runTool(ctx, "get_order", { order_id: 99999 }), /does not exist/);
  });
});

describe("lookups", () => {
  it("finds a customer by email regardless of case and lists their orders", () => {
    const found = runTool(ctx, "find_customer_by_email", { email: "AISHA.KHAN@example.com" });
    expect(found).toMatchObject({ ok: true, value: { customer_id: "C001" } });
    const orders = runTool(ctx, "list_customer_orders", { customer_id: "C001" });
    expect(orders.ok && JSON.stringify(orders.value)).toContain('"order_id"');
  });
});

describe("fresh shops", () => {
  it("never see each other's changes", () => {
    const id = orderWhere("o.status = 'processing'");
    expect(runTool(ctx, "cancel_order", { order_id: id }).ok).toBe(true);
    const other = openFreshShop(seedPath);
    const order = runTool({ db: other.db, today: ctx.today }, "get_order", { order_id: id });
    other.dispose();
    expect(order).toMatchObject({ ok: true, value: { status: "processing" } });
  });
});
