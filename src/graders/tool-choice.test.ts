import { afterAll, describe, expect, it } from "vitest";
import { CANCEL_REFERENCE, taskWith, testShop } from "./fixtures";
import { callIndex, scripted, type Line } from "./script";
import { gradeToolChoice } from "./tool-choice";

const { seedPath, dispose } = testShop("tool-choice");
afterAll(dispose);

const task = taskWith(CANCEL_REFERENCE);
const ask: Line = { customer: "I'm esha.qureshi@example.com, please cancel order 1005." };
const reference: Line[] = CANCEL_REFERENCE.map((c) => ({ call: c.tool, input: c.input }));
const listOrders: Line = { call: "list_customer_orders", input: { customer_id: "C005" } };

describe("tool choice", () => {
  it("passes calling exactly the reference's tools, however often", () => {
    const v = gradeToolChoice(task, scripted(seedPath, [ask, ...reference, reference[1]]));
    expect(v).toMatchObject({ pass: true, ungraded: false });
  });
  it("passes reaching the same facts with other read tools", () => {
    // Lists the orders instead of getting 1005, then cancels it.
    const v = gradeToolChoice(task, scripted(seedPath, [ask, reference[0], listOrders, reference[2]]));
    expect(v).toMatchObject({ pass: true, ungraded: false });
  });
  it("fails a write the task doesn't need, pointing at its first call", () => {
    const t = scripted(seedPath, [ask, ...reference, { call: "transfer_to_human", input: { summary: "wants order 1005 cancelled" } }]);
    const v = gradeToolChoice(task, t);
    expect(v).toMatchObject({ pass: false, step: callIndex(t, "transfer_to_human") });
    expect(v.reason).toContain("transfer_to_human");
  });
  it("fails a needed write never called", () => {
    const v = gradeToolChoice(task, scripted(seedPath, [ask, ...reference.slice(0, 2)]));
    expect(v).toMatchObject({ pass: false, step: null });
    expect(v.reason).toContain("never called cancel_order");
  });
  it("passes changing nothing when the reference changes nothing", () => {
    const readOnly = taskWith(CANCEL_REFERENCE.slice(0, 2));
    expect(gradeToolChoice(readOnly, scripted(seedPath, [ask, { say: "Order 1005 is still processing." }]))).toMatchObject({ pass: true, ungraded: false });
  });
  it("couldn't grade a task with no reference", () => {
    expect(gradeToolChoice(taskWith([]), scripted(seedPath, [ask, ...reference]))).toMatchObject({ pass: false, ungraded: true });
  });
});
