import { afterAll, describe, expect, it } from "vitest";
import { gradeArguments } from "./arguments";
import { testShop } from "./fixtures";
import { callIndex, scripted, type Line } from "./script";

const { seedPath, shop, dispose } = testShop("arguments");
afterAll(dispose);

const ask: Line = { customer: "Where's my order?" };
const grade = (lines: Line[]) => {
  const t = scripted(seedPath, [ask, ...lines]);
  return { t, v: gradeArguments(t, shop) };
};

describe("arguments", () => {
  it("passes valid inputs naming real ids", () => {
    const { v } = grade([
      { call: "find_customer_by_email", input: { email: "esha.qureshi@example.com" } },
      { call: "list_customer_orders", input: { customer_id: "C005" } },
      { call: "get_order", input: { order_id: 1005 } },
    ]);
    expect(v).toMatchObject({ pass: true, ungraded: false });
  });
  it("fails an order id that doesn't exist, at that call", () => {
    const { t, v } = grade([{ call: "get_order", input: { order_id: 1005 } }, { call: "get_order", input: { order_id: 9999 } }]);
    expect(v).toMatchObject({ pass: false, step: callIndex(t, "get_order", 1) });
    expect(v.reason).toContain("9999");
  });
  it("fails an input that breaks the tool's schema", () => {
    expect(grade([{ call: "get_order", input: { order_id: "1005" } }]).v.reason).toContain("schema");
  });
  it("fails a tool the shop doesn't have", () => {
    expect(grade([{ call: "issue_voucher", input: { order_id: 1005 } }]).v.pass).toBe(false);
  });
  it("fails a customer id that doesn't exist", () => {
    expect(grade([{ call: "list_customer_orders", input: { customer_id: "C999" } }]).v.reason).toContain("C999");
  });
});
