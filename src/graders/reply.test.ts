import { describe, expect, it } from "vitest";
import type { Trajectory } from "../eval/trajectory";
import { taskSchema, type Fact } from "../tasks/schema";
import { gradeReply, normalizeReply, statesFact } from "./reply";

const says = (text: string, fact: Fact) => statesFact(normalizeReply(text), fact);

describe("money facts", () => {
  it.each(["Rs 1,200", "Rs. 1200", "1200 rupees", "PKR 1,200", "1,200 Rs", "a refund of Rs 1,200.00"])("counts %s", (text) => {
    expect(says(text, { money: 1200 })).toBe(true);
  });
  it.each(["Rs 12,000", "Rs 1,2000", "order 1200", "Rs 11200"])("doesn't count %s", (text) => {
    expect(says(text, { money: 1200 })).toBe(false);
  });
});

describe("date facts", () => {
  it.each(["2026-03-14", "14 March", "March 14th", "on the 14th of Mar, 2026", "Mar 14, 2026"])("counts %s", (text) => {
    expect(says(text, { date: "2026-03-14" })).toBe(true);
  });
  it.each(["March 4", "114 March", "2026-03-15", "4 March"])("doesn't count %s", (text) => {
    expect(says(text, { date: "2026-03-14" })).toBe(false);
  });
});

describe("reply grader", () => {
  const task = taskSchema.parse({
    id: "status-99",
    split: "dev",
    category: "status",
    difficulty: "easy",
    adversarial: true,
    note: "test",
    first_message: "Where is order 1002?",
    canned_replies: [],
    expected: { changes: [], facts: [{ text: ["shipped"] }, { money: 4999 }], refusal: true },
    reference: [],
  });
  const said = (...texts: string[]): Trajectory => ({
    events: texts.map((text, i) => ({ type: "text", step: i + 1, text })),
    end: "answered",
    changes: [],
  });

  it("passes when every fact and the refusal appear somewhere in the conversation", () => {
    expect(gradeReply(task, said("It has Shipped.", "It cost Rs 4,999, and I can’t offer a discount.")).pass).toBe(true);
  });

  it("names every missing fact and a missing refusal", () => {
    expect(gradeReply(task, said("It's on the way.")).reason).toBe("never states \"shipped\"; never states Rs 4,999; never refuses");
  });

  it("ignores what the customer said", () => {
    const trajectory: Trajectory = { events: [{ type: "customer", text: "Has it shipped? It cost Rs 4,999. You can't help?" }], end: "answered", changes: [] };
    expect(gradeReply(task, trajectory).pass).toBe(false);
  });
});
