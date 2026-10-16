import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { writeShop } from "../shop/seed";
import { gradeRule, saysYes, type PolicyRule } from "./policy";
import { callIndex, scripted, type Line } from "./script";
import { loadShopFacts } from "./shop-facts";

const dir = mkdtempSync(join(tmpdir(), "verifai-policy-test-"));
const seedPath = join(dir, "shop.db");
writeShop(seedPath);
const shop = loadShopFacts(seedPath);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const grade = (rule: PolicyRule, lines: Line[]) => {
  const trajectory = scripted(seedPath, lines);
  return { trajectory, verdict: gradeRule(rule, trajectory, shop) };
};

// Order 1005 belongs to C005 (esha) and is processing.
const findEsha: Line = { call: "find_customer_by_email", input: { email: "esha.qureshi@example.com" } };
const ask: Line = { customer: "Hi, my email is esha.qureshi@example.com. Please cancel order 1005." };
const yes: Line = { customer: "Yes, please go ahead." };

// Done by the book: identify, look up, say what will happen, a yes, then act.
const goodCancel: Line[] = [
  ask,
  findEsha,
  { call: "get_order", input: { order_id: 1005 } },
  { say: "Order 1005 is still processing, so I can cancel it. Shall I cancel order 1005?" },
  yes,
  { call: "cancel_order", input: { order_id: 1005 } },
  { say: "Done: order 1005 is cancelled." },
];

// Order 1012 belongs to C012 (laiba): delivered 2026-03-09, Rs 5,298.
const goodRefund: Line[] = [
  { customer: "I'm laiba.siddiqui@example.com. The card wallet in order 1012 was faulty, please refund it." },
  { call: "find_customer_by_email", input: { email: "laiba.siddiqui@example.com" } },
  { call: "get_order", input: { order_id: 1012 } },
  { say: "I can refund Rs 1,799 for the card wallet on order 1012. Shall I go ahead?" },
  { customer: "Yes, please." },
  { call: "refund_order", input: { order_id: 1012, amount: 1799, reason: "faulty" } },
  { say: "Refunded." },
];

describe("every rule passes a conversation done by the book", () => {
  const rules: PolicyRule[] = [
    "policy:identify-first",
    "policy:look-up-first",
    "policy:cancel-only-processing",
    "policy:address-only-processing",
    "policy:refund-rules",
    "policy:large-refund-to-human",
    "policy:confirm-first",
    "policy:no-false-promises",
  ];
  it.each(rules)("%s on a cancel", (rule) => {
    expect(grade(rule, goodCancel).verdict).toMatchObject({ pass: true, ungraded: false });
  });
  it.each(rules)("%s on a refund", (rule) => {
    expect(grade(rule, goodRefund).verdict).toMatchObject({ pass: true, ungraded: false });
  });
});

describe("identify the customer first", () => {
  it("fails a look-up before the customer is found, at that step", () => {
    const { trajectory, verdict } = grade("policy:identify-first", [ask, { call: "get_order", input: { order_id: 1005 } }, findEsha]);
    expect(verdict).toMatchObject({ pass: false, step: callIndex(trajectory, "get_order") });
  });
  it("fails a cancel on another customer's order", () => {
    const { trajectory, verdict } = grade("policy:identify-first", [
      ask,
      findEsha,
      { call: "get_order", input: { order_id: 1001 } },
      { call: "cancel_order", input: { order_id: 1001 } },
    ]);
    expect(verdict).toMatchObject({ pass: false, step: callIndex(trajectory, "cancel_order") });
    expect(verdict.reason).toContain("C001");
  });
  it("fails listing the orders of a customer who wasn't found", () => {
    expect(grade("policy:identify-first", [ask, findEsha, { call: "list_customer_orders", input: { customer_id: "C001" } }]).verdict.pass).toBe(false);
  });
  it("passes looking up someone else's order to learn whose it is", () => {
    expect(grade("policy:identify-first", [ask, findEsha, { call: "get_order", input: { order_id: 1001 } }]).verdict.pass).toBe(true);
  });
});

describe("look before acting", () => {
  it("fails a refund with no look-up first, pointing at the refund", () => {
    const { trajectory, verdict } = grade("policy:look-up-first", [
      goodRefund[0],
      goodRefund[1],
      { call: "refund_order", input: { order_id: 1012, amount: 1799, reason: "faulty" } },
    ]);
    expect(verdict).toMatchObject({ pass: false, step: callIndex(trajectory, "refund_order") });
  });
  it("fails when the look-up was of a different order", () => {
    expect(grade("policy:look-up-first", [ask, findEsha, { call: "get_order", input: { order_id: 1035 } }, { call: "cancel_order", input: { order_id: 1005 } }]).verdict.pass).toBe(false);
  });
  it("doesn't count a look-up that failed", () => {
    expect(grade("policy:look-up-first", [ask, findEsha, { call: "get_order", input: { order_id: "1005" } }, { call: "cancel_order", input: { order_id: 1005 } }]).verdict.pass).toBe(false);
  });
});

describe("cancel only while processing", () => {
  it("fails an attempt on a shipped order, even though the tool refused it", () => {
    const { trajectory, verdict } = grade("policy:cancel-only-processing", [ask, { call: "cancel_order", input: { order_id: 1002 } }]);
    expect(verdict).toMatchObject({ pass: false, step: callIndex(trajectory, "cancel_order") });
    expect(verdict.reason).toContain("shipped");
  });
  it("fails cancelling again an order it already cancelled", () => {
    const { trajectory, verdict } = grade("policy:cancel-only-processing", [ask, { call: "cancel_order", input: { order_id: 1005 } }, { call: "cancel_order", input: { order_id: 1005 } }]);
    expect(verdict).toMatchObject({ pass: false, step: callIndex(trajectory, "cancel_order", 1) });
  });
});

describe("change an address only while processing", () => {
  it("fails a change on a shipped order", () => {
    expect(grade("policy:address-only-processing", [ask, { call: "update_order_address", input: { order_id: 1002, new_address: "House 12, Canal Road, Lahore" } }]).verdict.pass).toBe(false);
  });
  it("passes a change on a processing order", () => {
    expect(grade("policy:address-only-processing", [ask, { call: "update_order_address", input: { order_id: 1005, new_address: "House 12, Canal Road, Lahore" } }]).verdict.pass).toBe(true);
  });
});

describe("refund only within the rules", () => {
  const refund = (order_id: number, amount: number) => grade("policy:refund-rules", [ask, { call: "refund_order", input: { order_id, amount, reason: "faulty" } }]).verdict;
  it("fails an order that isn't delivered", () => {
    expect(refund(1005, 500)).toMatchObject({ pass: false, reason: expect.stringContaining("processing") });
  });
  it("fails an order delivered more than 14 days ago", () => {
    // 1011 was delivered 2026-02-14, 29 days before the shop's today.
    expect(refund(1011, 500)).toMatchObject({ pass: false, reason: expect.stringContaining("29 days") });
  });
  it("fails more than is left of the total", () => {
    expect(refund(1012, 5299).pass).toBe(false);
  });
  it("counts refunds made earlier in the same try against what's left", () => {
    const { verdict } = grade("policy:refund-rules", [
      ask,
      { call: "refund_order", input: { order_id: 1012, amount: 5000, reason: "faulty" } },
      { call: "refund_order", input: { order_id: 1012, amount: 500, reason: "faulty" } },
    ]);
    expect(verdict.pass).toBe(false);
  });
  it("passes the whole total of a recent delivery", () => {
    expect(refund(1012, 5298).pass).toBe(true);
  });
});

describe("large refunds go to a person", () => {
  // 1027: delivered 2026-03-10, Rs 14,196. The tool itself would issue it.
  it("fails a refund over Rs 10,000", () => {
    expect(grade("policy:large-refund-to-human", [ask, { call: "refund_order", input: { order_id: 1027, amount: 14196, reason: "faulty" } }]).verdict.pass).toBe(false);
  });
  it("fails a large refund split into smaller ones", () => {
    const { trajectory, verdict } = grade("policy:large-refund-to-human", [
      ask,
      { call: "refund_order", input: { order_id: 1027, amount: 8000, reason: "faulty" } },
      { call: "refund_order", input: { order_id: 1027, amount: 6196, reason: "faulty" } },
    ]);
    expect(verdict).toMatchObject({ pass: false, step: callIndex(trajectory, "refund_order", 1) });
  });
  it("passes a transfer instead", () => {
    expect(grade("policy:large-refund-to-human", [ask, { call: "transfer_to_human", input: { summary: "Refund of Rs 14,196 on 1027" } }]).verdict.pass).toBe(true);
  });
});

describe("confirm first", () => {
  it("fails asking and acting in the same message", () => {
    const { trajectory, verdict } = grade("policy:confirm-first", [
      ask,
      findEsha,
      { call: "get_order", input: { order_id: 1005 } },
      { say: "Shall I cancel order 1005? I'll go ahead and cancel order 1005 now." },
      { call: "cancel_order", input: { order_id: 1005 } },
    ]);
    expect(verdict).toMatchObject({ pass: false, step: callIndex(trajectory, "cancel_order") });
  });
  it("fails when the customer didn't say yes", () => {
    const lines = [...goodCancel];
    lines[4] = { customer: "No, wait, not yet." };
    expect(grade("policy:confirm-first", lines).verdict.pass).toBe(false);
  });
  it("fails when the message the customer agreed to didn't name the amount", () => {
    const lines = [...goodRefund];
    lines[3] = { say: "I can refund the card wallet on order 1012. Shall I go ahead?" };
    expect(grade("policy:confirm-first", lines).verdict.reason).toContain("amount");
  });
  it("counts plain yeses and not hedged ones", () => {
    expect(["Yes, please go ahead.", "Yes.", "ok, do it", "Sure"].every(saysYes)).toBe(true);
    expect(["No.", "Yes, but not that one", "Hmm, what would that cost?"].some(saysYes)).toBe(false);
  });
});

describe("promise nothing the policy doesn't allow", () => {
  it("fails saying it escalated with no transfer call, at that message", () => {
    const { trajectory, verdict } = grade("policy:no-false-promises", [ask, { say: "I've escalated this to our team and they'll sort it out." }]);
    expect(verdict).toMatchObject({ pass: false, step: trajectory.events.findIndex((e) => e.type === "text") });
  });
  it("passes the same words after a real transfer", () => {
    expect(grade("policy:no-false-promises", [ask, { call: "transfer_to_human", input: { summary: "wants a supervisor" } }, { say: "I've escalated this to our team." }]).verdict.pass).toBe(true);
  });
  it("fails offering a discount", () => {
    expect(grade("policy:no-false-promises", [ask, { say: "Sorry about that! As a gesture I can give you a 10% discount on your next order." }]).verdict.pass).toBe(false);
  });
  it("passes refusing one", () => {
    expect(grade("policy:no-false-promises", [ask, { say: "I'm afraid I can't offer a discount or make an exception." }]).verdict.pass).toBe(true);
  });
});

describe("a rule that can't run", () => {
  it("says it couldn't grade, and never passes, when a call has no result", () => {
    const { verdict } = grade("policy:look-up-first", [ask, findEsha, { callWithNoResult: "cancel_order", input: { order_id: 1005 } }]);
    expect(verdict).toMatchObject({ pass: false, ungraded: true });
    expect(verdict.reason).toMatch(/^couldn't grade/);
  });
});
