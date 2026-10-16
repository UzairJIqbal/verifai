// A seeded shop in a temp folder for the grader tests, and a task built
// around a reference. Test-only.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeShop } from "../shop/seed";
import { taskSchema, type Task } from "../tasks/schema";
import { loadShopFacts } from "./shop-facts";

export function testShop(name: string) {
  const dir = mkdtempSync(join(tmpdir(), `verifai-${name}-test-`));
  const seedPath = join(dir, "shop.db");
  writeShop(seedPath);
  return { seedPath, shop: loadShopFacts(seedPath), dispose: () => rmSync(dir, { recursive: true, force: true }) };
}

// Cancel order 1005 for esha: find her, look it up, cancel it.
export const CANCEL_REFERENCE: Task["reference"] = [
  { tool: "find_customer_by_email", input: { email: "esha.qureshi@example.com" } },
  { tool: "get_order", input: { order_id: 1005 } },
  { tool: "cancel_order", input: { order_id: 1005 } },
];

export const taskWith = (reference: Task["reference"]): Task =>
  taskSchema.parse({
    id: "cancel-99",
    split: "dev",
    category: "cancel",
    difficulty: "easy",
    adversarial: false,
    note: "test",
    first_message: "Please cancel order 1005.",
    canned_replies: [],
    expected: { changes: [{ op: "update", table: "orders", key: { id: 1005 }, set: { status: "cancelled" } }] },
    reference,
  });
