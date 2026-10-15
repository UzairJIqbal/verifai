import { describe, expect, it } from "vitest";
import { taskSchema, type Task } from "../tasks/schema";
import { pickSmokeTasks } from "./smoke";

const task = (id: string): Task =>
  taskSchema.parse({
    id,
    split: "dev",
    category: id.split("-")[0],
    difficulty: "easy",
    adversarial: false,
    note: "test",
    first_message: "Hi",
    canned_replies: [],
    expected: { changes: [] },
    reference: [],
  });
const dev = ["cancel-01", "cancel-02", "refund-01", "address-01", "status-01", "transfer-01"].map(task);
const one = ["cancel-01", "refund-01", "address-01", "status-01", "transfer-01"];

describe("smoke tasks", () => {
  it("takes the named dev tasks, one per category, in the order named", () => {
    expect(pickSmokeTasks(dev, one).map((t) => t.id)).toEqual(one);
  });

  it("refuses an id that isn't a dev task, two from one category, or a missing category", () => {
    expect(() => pickSmokeTasks(dev, [...one.slice(0, 4), "transfer-09"])).toThrow(/transfer-09, which isn't a dev task/);
    expect(() => pickSmokeTasks(dev, [...one, "cancel-02"])).toThrow(/two cancel tasks/);
    expect(() => pickSmokeTasks(dev, one.slice(0, 4))).toThrow(/no transfer task/);
  });
});
