import { afterAll, describe, expect, it } from "vitest";
import { gradeEfficiency, gradeLoop } from "./efficiency";
import { CANCEL_REFERENCE, taskWith, testShop } from "./fixtures";
import { callIndex, scripted, type Line } from "./script";

const { seedPath, dispose } = testShop("efficiency");
afterAll(dispose);

const task = taskWith(CANCEL_REFERENCE);
const ask: Line = { customer: "I'm esha.qureshi@example.com, please cancel order 1005." };
const find: Line = { call: "find_customer_by_email", input: { email: "esha.qureshi@example.com" } };
const list: Line = { call: "list_customer_orders", input: { customer_id: "C005" } };
const get: Line = { call: "get_order", input: { order_id: 1005 } };
const cancel: Line = { call: "cancel_order", input: { order_id: 1005 } };

describe("efficiency", () => {
  it("passes one call over the reference", () => {
    expect(gradeEfficiency(task, scripted(seedPath, [ask, find, list, get, cancel]))).toMatchObject({ pass: true, ungraded: false });
  });
  it("fails two over, pointing at the first call past the allowance", () => {
    const t = scripted(seedPath, [ask, find, list, get, { call: "get_order", input: { order_id: 1001 } }, cancel]);
    expect(gradeEfficiency(task, t)).toMatchObject({ pass: false, step: callIndex(t, "cancel_order") });
  });
  it("couldn't grade a task with no reference", () => {
    expect(gradeEfficiency(taskWith([]), scripted(seedPath, [ask, find]))).toMatchObject({ pass: false, ungraded: true });
  });
});

describe("loop", () => {
  it("fails a repeated identical call, at the repeat", () => {
    const t = scripted(seedPath, [ask, find, get, { customer: "Hello?" }, get]);
    const v = gradeLoop(t);
    expect(v).toMatchObject({ pass: false, step: callIndex(t, "get_order", 1) });
    expect(v.reason).toContain(`#${callIndex(t, "get_order")}`);
  });
  it("passes looking again after a change", () => {
    expect(gradeLoop(scripted(seedPath, [ask, find, get, cancel, get]))).toMatchObject({ pass: true, ungraded: false });
  });
  it("passes the same tool with different inputs", () => {
    expect(gradeLoop(scripted(seedPath, [ask, get, { call: "get_order", input: { order_id: 1001 } }])).pass).toBe(true);
  });
});
