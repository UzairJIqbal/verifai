import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../config";
import { buildRunConfig, configKey } from "../eval/plan";
import { getShopToday, openFreshShop, type Shop } from "../shop/db";
import { writeShop } from "../shop/seed";
import { runTool, type ToolContext } from "./tools";
import { REFUND_LIMIT_RUPEES, VALIDATIONS } from "./validation";
import { knobsLabel, loadAgentVersion, preCheckOf } from "./versions";

const dir = mkdtempSync(join(tmpdir(), "verifai-validation-"));
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

const refunds = () => shop.db.prepare("SELECT COUNT(*) AS n FROM refunds").get()?.n;
// A delivered order inside the refund window with more than the limit left.
function bigRefundable(): { id: number; remaining: number } {
  const row = shop.db
    .prepare(
      `SELECT o.id, o.total - (SELECT COALESCE(SUM(amount), 0) FROM refunds r WHERE r.order_id = o.id) AS remaining FROM orders o
       WHERE o.status = 'delivered' AND julianday((SELECT value FROM shop_meta WHERE key = 'today')) - julianday(o.delivered_at) <= 14
       AND o.total - (SELECT COALESCE(SUM(amount), 0) FROM refunds r WHERE r.order_id = o.id) > ? ORDER BY o.id LIMIT 1`,
    )
    .get(REFUND_LIMIT_RUPEES);
  if (row === undefined) throw new Error("The seed has no delivered order with more than the limit left to refund.");
  return { id: Number(row.id), remaining: Number(row.remaining) };
}

const refundLimit = { tool: VALIDATIONS["refund-limit"].tool, check: VALIDATIONS["refund-limit"].check };

describe("refund-limit validation", () => {
  it("stops a refund over the limit before it changes anything, and says to transfer", () => {
    const order = bigRefundable();
    const before = refunds();
    const outcome = runTool(ctx, "refund_order", { order_id: order.id, amount: REFUND_LIMIT_RUPEES + 1, reason: "broken" }, undefined, refundLimit);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/transfer_to_human/);
    expect(refunds()).toBe(before);
  });

  it("lets a refund at the limit through", () => {
    const order = bigRefundable();
    const outcome = runTool(ctx, "refund_order", { order_id: order.id, amount: REFUND_LIMIT_RUPEES, reason: "broken" }, undefined, refundLimit);
    expect(outcome.ok).toBe(true);
  });

  it("leaves a malformed input to the tool's own error", () => {
    const outcome = runTool(ctx, "refund_order", { order_id: 1, amount: "lots" }, undefined, refundLimit);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/^Invalid input/);
  });

  it("doesn't touch other tools", () => {
    expect(VALIDATIONS["refund-limit"].check({ summary: "x" })).toBeNull();
    const outcome = runTool(ctx, "transfer_to_human", { summary: "big refund" }, undefined, refundLimit);
    expect(outcome.ok).toBe(true);
  });

  it("runs only when the version asks for it", () => {
    const order = bigRefundable();
    const outcome = runTool(ctx, "refund_order", { order_id: order.id, amount: REFUND_LIMIT_RUPEES + 1, reason: "broken" }, undefined, null);
    expect(outcome.ok).toBe(true);
    expect(preCheckOf({ validation: null })).toBeNull();
    expect(preCheckOf({ validation: "refund-limit" })?.tool).toBe("refund_order");
  });
});

describe("versions with a validation step or exemplars", () => {
  const config = loadConfig();
  const plan = (validation: "refund-limit" | null) =>
    buildRunConfig({
      config,
      version: loadAgentVersion({ ...config, validation }, "2026-03-15"),
      datasetVersion: "v1",
      split: "dev",
      tasks: [],
      useCache: true,
      smoke: false,
    });

  // Runs made before these knobs existed keep their configuration key, so
  // their noise floors still apply.
  it("adds nothing to a run's configuration when both are off", () => {
    const off = plan(null);
    expect("validation" in off).toBe(false);
    expect("exemplars" in off).toBe(false);
  });

  it("gives a version with a validation step its own configuration key", () => {
    expect(plan("refund-limit").validation).toBe("refund-limit");
    expect(configKey(plan("refund-limit"))).not.toBe(configKey(plan(null)));
  });

  it("won't plan an exemplar run without the store it reads", () => {
    expect(() =>
      buildRunConfig({
        config,
        version: loadAgentVersion({ ...config, exemplars: true }, "2026-03-15"),
        datasetVersion: "v1",
        split: "dev",
        tasks: [],
        useCache: true,
        smoke: false,
      }),
    ).toThrow(/exemplar store/);
  });

  it("names a version by what it changes", () => {
    expect(knobsLabel({ promptVersion: "v2", toolDescriptionsVersion: "v1", validation: "refund-limit", exemplars: true })).toBe(
      "prompt v2 · tools v1 · validation refund-limit · exemplars",
    );
  });
});
