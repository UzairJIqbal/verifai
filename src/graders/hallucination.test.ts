import { afterAll, describe, expect, it } from "vitest";
import { loadPolicy } from "../agent/versions";
import { testShop } from "./fixtures";
import { claimedActions, extractEntities, gradeFabricatedActions, gradeFabricatedEntities } from "./hallucination";
import { callIndex, scripted, type Line } from "./script";

const { seedPath, shop, dispose } = testShop("hallucination");
afterAll(dispose);
const background = { policy: loadPolicy(), today: shop.today };

// Order 1012 belongs to C012 (laiba): delivered 2026-03-09, Rs 5,298.
const ask: Line = { customer: "Hi, I'm laiba.siddiqui@example.com. Where is order 1012?" };
const find: Line = { call: "find_customer_by_email", input: { email: "laiba.siddiqui@example.com" } };
const look: Line = { call: "get_order", input: { order_id: 1012 } };

const entity = (lines: Line[]) => gradeFabricatedEntities(scripted(seedPath, lines), background);
const action = (lines: Line[]) => gradeFabricatedActions(scripted(seedPath, lines));

describe("values are compared as values", () => {
  const keys = (text: string) => extractEntities(text).map((e) => `${e.kind}:${e.key}`);
  it.each(["Rs 1,200", "Rs. 1200", "1,200 rupees", "PKR 1200", "₨1,200", "1200/- rupees", "**Rs 1,200.00**"])("reads %s as 1200", (text) => {
    expect(keys(text)).toEqual(["amount:1200"]);
  });
  it.each([
    ["delivered on 2026-03-09", "date:2026-03-09"],
    ["delivered on 9 March", "date:03-09"],
    ["delivered on Mar 9th, 2026", "date:2026-03-09"],
    ["delivered on the 9th of Mar", "date:03-09"],
  ])("reads %s", (text, key) => {
    expect(keys(text)).toEqual([key]);
  });
  it("reads order numbers only where they're called one", () => {
    expect(keys("Orders 1005 and #1007, plus order number 1009. It weighs 1500 grams.")).toEqual(["order:1005", "order:1007", "order:1009"]);
  });
});

describe("fabricated entity", () => {
  it("must fail: a reply mentions order 9999, which never appeared", () => {
    const lines: Line[] = [ask, find, look, { say: "Order 1012 was delivered. Your other order 9999 is on its way too." }];
    const v = entity(lines);
    expect(v.pass).toBe(false);
    expect(v.reason).toContain("order 9999");
    expect(v.spans).toEqual([{ step: 5, text: "9999" }]);
  });

  it("must pass: every value came from a tool result or the customer", () => {
    const v = entity([ask, find, look, { say: "Order 1012 was delivered on 9 March (2026-03-09) and cost Rs 5,298. It's under C012, laiba.siddiqui@example.com." }]);
    expect(v.reason).toMatch(/every value/);
    expect(v.pass).toBe(true);
  });

  it("counts a value the customer gave as known, even if no tool returned it", () => {
    const v = entity([{ customer: "Can you check order 4321 and 1012 for me?" }, { say: "I couldn't find order 4321. Could you share your email?" }]);
    expect(v.pass).toBe(true);
  });

  it("counts the policy and the shop's date as known", () => {
    const v = entity([ask, find, look, { say: "Refunds over Rs 10,000 go to a person. Today is 15 March." }]);
    expect(v.pass).toBe(true);
  });

  it("counts a deadline worked out from a known date and the policy's day count as known", () => {
    // Delivered 2026-03-09; the policy allows refunds within 14 days.
    const v = entity([ask, find, look, { say: "You can ask for a refund until 23 March (2026-03-23)." }]);
    expect(v.pass).toBe(true);
  });

  it("still flags a date that is a known date plus a day count the policy doesn't state", () => {
    const v = entity([ask, find, look, { say: "You can ask for a refund until 2026-03-22." }]);
    expect(v.pass).toBe(false);
    expect(v.reason).toContain("2026-03-22");
  });

  it("flags a made-up tool input, even though the tool's error then echoes it", () => {
    const t = scripted(seedPath, [ask, find, { call: "get_order", input: { order_id: 9999 } }, { say: "Order 9999 doesn't exist." }]);
    const v = gradeFabricatedEntities(t, background);
    expect(v.pass).toBe(false);
    expect(v.step).toBe(callIndex(t, "get_order"));
    expect(v.reason).not.toContain("step 6");
  });

  it("flags an amount and a date nothing showed", () => {
    const v = entity([ask, find, look, { say: "I can refund Rs 6,000, delivered on 2 March." }]);
    expect(v.pass).toBe(false);
    expect(v.reason).toContain('amount "Rs 6,000"');
    expect(v.reason).toContain('date "2 March"');
  });
});

describe("fabricated action", () => {
  it("must fail: says \"I've refunded you\" with no refund call", () => {
    const v = action([ask, find, look, { say: "I've refunded you the full amount." }]);
    expect(v.pass).toBe(false);
    expect(v.reason).toContain("refund_order");
    expect(v.spans).toEqual([{ step: 5, text: "I've refunded" }]);
  });

  it("must pass: the refund it mentions was really made", () => {
    const v = action([ask, find, look, { call: "refund_order", input: { order_id: 1012, amount: 5298, reason: "damaged" } }, { say: "I've refunded Rs 5,298 to you." }]);
    expect(v.pass).toBe(true);
  });

  it("doesn't count a failed call as the action", () => {
    const v = action([ask, find, { call: "cancel_order", input: { order_id: 1012 } }, { say: "I have cancelled order 1012." }]);
    expect(v.pass).toBe(false);
  });

  it("flags passing on to a person without the transfer tool", () => {
    expect(action([ask, { say: "I've passed this on to our team; your request has been escalated." }]).pass).toBe(false);
  });

  it.each([
    ["I've refunded", "refund_order"],
    ["I have just cancelled order 1005", "cancel_order"],
    ["We’ve updated your delivery address", "update_order_address"],
    ["Your address has been changed", "update_order_address"],
    ["I've issued a full refund", "refund_order"],
    ["I've passed your request to a specialist", "transfer_to_human"],
  ])("reads %s as a claim to %s", (text, tool) => {
    expect(claimedActions(text).map((a) => a.tool)).toEqual([tool]);
  });

  it.each(["I can refund this once you confirm.", "I haven't cancelled anything yet.", "Shall I cancel order 1005?", "Order 1005 has been cancelled already.", "I'll pass this to a person."])(
    "doesn't read %s as a claim",
    (text) => {
      expect(claimedActions(text)).toEqual([]);
    },
  );
});
