import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it } from "vitest";
import { requireApiKey } from "../config";
import { runTool } from "../agent/tools";
import { getShopToday } from "../shop/db";
import { writeShop } from "../shop/seed";
import { focusedOrderId } from "./protocol";
import { listPickableCustomers, readShopSnapshot } from "./snapshot";

const dir = mkdtempSync(join(tmpdir(), "verifai-playground-test-"));
const seedPath = join(dir, "seed.db");
writeShop(seedPath);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("focusedOrderId", () => {
  it("is the order named by the latest call that names one", () => {
    expect(focusedOrderId([])).toBeNull();
    expect(
      focusedOrderId([
        { input: { order_id: 3 } },
        { input: { order_id: 7 }, outcome: { ok: true, value: {} } },
        { input: { email: "a@b.c" }, outcome: { ok: true, value: [] } },
      ]),
    ).toBe(7);
  });

  it("falls back to an order id in a successful result", () => {
    expect(focusedOrderId([{ input: {}, outcome: { ok: true, value: { order_id: 12, status: "shipped" } } }])).toBe(12);
    expect(focusedOrderId([{ input: {}, outcome: { ok: false, error: "no" } }])).toBeNull();
  });
});

describe("shop snapshot", () => {
  it("offers customers whose order is still processing", () => {
    const picks = listPickableCustomers(seedPath);
    expect(picks.length).toBeGreaterThan(0);
    const db = new DatabaseSync(seedPath, { readOnly: true });
    for (const pick of picks) {
      const snap = readShopSnapshot(db, { email: pick.email, orderId: pick.processingOrderId });
      expect(snap.customer?.email).toBe(pick.email);
      expect(snap.order?.status).toBe("processing");
      expect(snap.order?.customerId).toBe(snap.customer?.id);
    }
    db.close();
  });

  it("shows a cancel in the copy and not in the seed", () => {
    const copyPath = join(dir, "copy.db");
    copyFileSync(seedPath, copyPath);
    const [pick] = listPickableCustomers(seedPath);
    const db = new DatabaseSync(copyPath);
    const outcome = runTool({ db, today: getShopToday(db) }, "cancel_order", { order_id: pick.processingOrderId });
    expect(outcome.ok).toBe(true);
    expect(readShopSnapshot(db, { orderId: pick.processingOrderId }).order?.status).toBe("cancelled");
    db.close();

    const seed = new DatabaseSync(seedPath, { readOnly: true });
    expect(readShopSnapshot(seed, { orderId: pick.processingOrderId }).order?.status).toBe("processing");
    seed.close();
  });

  it("answers an unknown email or order with nothing, not an error", () => {
    const db = new DatabaseSync(seedPath, { readOnly: true });
    expect(readShopSnapshot(db, { email: "nobody@example.com", orderId: 999999 })).toEqual({ customer: null, order: null });
    db.close();
  });
});

describe("requireApiKey", () => {
  it("fails in plain words when the key is nowhere", () => {
    expect(() => requireApiKey({ env: "VERIFAI_TEST_NO_SUCH_KEY", getKeyAt: "https://example.com" })).toThrow(
      /VERIFAI_TEST_NO_SUCH_KEY is missing/,
    );
  });
});
