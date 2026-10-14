import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { openFreshShop, getShopToday } from "../shop/db";
import { diffShops, dumpShop } from "../shop/diff";
import { writeShop } from "../shop/seed";
import { runTool } from "../agent/tools";
import type { Trajectory } from "../eval/trajectory";
import { taskSchema } from "../tasks/schema";
import { gradeState } from "./state";

const dir = mkdtempSync(join(tmpdir(), "verifai-state-test-"));
const seedPath = join(dir, "shop.db");
writeShop(seedPath);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// The changes left by running these tool calls on a fresh shop.
function changesAfter(calls: [string, unknown][]): Trajectory {
  const shop = openFreshShop(seedPath);
  const ctx = { db: shop.db, today: getShopToday(shop.db) };
  const before = dumpShop(shop.db);
  for (const [name, input] of calls) expect(runTool(ctx, name, input).ok).toBe(true);
  const changes = diffShops(before, dumpShop(shop.db));
  shop.dispose();
  return { events: [], end: "answered", changes };
}

const refundTask = taskSchema.parse({
  id: "refund-99",
  split: "dev",
  category: "refund",
  difficulty: "easy",
  adversarial: false,
  note: "test",
  first_message: "Refund order 1012's card wallet.",
  canned_replies: [],
  expected: { changes: [{ op: "insert", table: "refunds", values: { order_id: 1012, amount: 1799, created_at: "2026-03-15" } }] },
  reference: [],
});

describe("diffShops", () => {
  it("finds nothing on an untouched shop", () => {
    expect(changesAfter([]).changes).toEqual([]);
  });

  it("reports an update with only the columns that changed", () => {
    const { changes } = changesAfter([["cancel_order", { order_id: 1001 }]]);
    expect(changes).toEqual([
      { kind: "update", table: "orders", key: { id: 1001 }, before: { status: "processing" }, after: { status: "cancelled" } },
    ]);
  });

  it("reports an insert with the whole new row", () => {
    const { changes } = changesAfter([["refund_order", { order_id: 1012, amount: 1799, reason: "faulty" }]]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "insert", table: "refunds", row: { order_id: 1012, amount: 1799, reason: "faulty" } });
  });
});

describe("state grader", () => {
  it("passes the exact expected change", () => {
    const verdict = gradeState(refundTask, changesAfter([["refund_order", { order_id: 1012, amount: 1799, reason: "faulty" }]]));
    expect(verdict.pass).toBe(true);
  });

  it("fails a correct refund plus an extra address change", () => {
    const verdict = gradeState(
      refundTask,
      changesAfter([
        ["refund_order", { order_id: 1012, amount: 1799, reason: "faulty" }],
        ["update_order_address", { order_id: 1001, new_address: "House 12, Canal Road, Lahore" }],
      ]),
    );
    expect(verdict.pass).toBe(false);
    expect(verdict.reason).toContain("extra: orders id=1001: shipping_address");
  });

  it("fails a wrong amount as both missing and extra", () => {
    const verdict = gradeState(refundTask, changesAfter([["refund_order", { order_id: 1012, amount: 1000, reason: "faulty" }]]));
    expect(verdict.pass).toBe(false);
    expect(verdict.reason).toMatch(/^missing: refunds: new row .*amount=1799.*; extra: refunds: new row .*amount=1000/);
  });

  it("fails when nothing was done", () => {
    expect(gradeState(refundTask, changesAfter([])).reason).toMatch(/^missing:/);
  });

  it("ignores case and spacing in text values", () => {
    const task = taskSchema.parse({
      ...refundTask,
      id: "address-99",
      category: "address",
      expected: { changes: [{ op: "update", table: "orders", key: { id: 1001 }, set: { shipping_address: "House 12, Canal Road, Lahore" } }] },
    });
    const verdict = gradeState(task, changesAfter([["update_order_address", { order_id: 1001, new_address: "house 12,  canal road, LAHORE" }]]));
    expect(verdict.pass).toBe(true);
  });
});
