import { describe, expect, it } from "vitest";
import type { Step } from "../results/schema";
import { judgeRequest } from "../judge/rubric";
import { orderSwappedRequest, PADDING, paddedSteps, paddingEligible, tallyBias, type BiasPair } from "./bias";

const steps: Step[] = [
  { type: "customer", text: "Where is my order?" },
  { type: "text", step: 1, text: "Checking." },
  { type: "text", step: 2, text: "It shipped yesterday." },
];
const background = { today: "2026-03-14", policy: "Be kind." };

describe("bias variants", () => {
  it("swaps the order but keeps every part", () => {
    const normal = judgeRequest(steps, background, ["answered-question", "tone"]);
    const swapped = orderSwappedRequest(steps, background, ["answered-question", "tone"]);
    expect(swapped.input.indexOf("CONVERSATION:")).toBeLessThan(swapped.input.indexOf("POLICY:"));
    expect(swapped.criteria).toEqual(["tone", "answered-question"]);
    expect([...swapped.input.split("\n")].sort().join()).toBe(
      [...normal.input.replace("answered-question, tone", "tone, answered-question").split("\n")].sort().join(),
    );
  });

  it("pads only the last reply", () => {
    const padded = paddedSteps(steps);
    expect(padded[1]).toEqual(steps[1]);
    expect(padded[2]).toMatchObject({ text: `It shipped yesterday.\n\n${PADDING}` });
  });

  it("pads only trials labelled as passing everything", () => {
    const base = { runId: "r", taskId: "t", tryNumber: 1, split: "judge-dev" as const, rubricVersion: "v", claimsPromptVersion: "v", labelledAt: "x", claims: [] };
    expect(paddingEligible({ ...base, criteria: [{ criterion: "tone", pass: true }] })).toBe(true);
    expect(paddingEligible({ ...base, criteria: [{ criterion: "tone", pass: false }] })).toBe(false);
    expect(paddingEligible({ ...base, criteria: [] })).toBe(false);
  });
});

describe("tallyBias", () => {
  const judged = (pass: boolean) => ({ status: "judged" as const, model: "m", rubricVersion: "v", verdicts: [{ criterion: "tone" as const, pass, reason: "r" }] });

  it("counts flips and lists only judge-dev ones", () => {
    const pairs: BiasPair[] = [
      { runId: "r", taskId: "a", tryNumber: 1, split: "judge-dev", before: judged(true), after: judged(false) },
      { runId: "r", taskId: "b", tryNumber: 1, split: "judge-test", before: judged(true), after: judged(false) },
      { runId: "r", taskId: "c", tryNumber: 1, split: "judge-test", before: judged(true), after: judged(true) },
      { runId: "r", taskId: "d", tryNumber: 1, split: "judge-dev", before: judged(true), after: { status: "ungraded", model: "m", rubricVersion: "v", reason: "x" } },
    ];
    const result = tallyBias("padding", "m · rubric v", "now", pairs);
    expect(result).toMatchObject({ trials: 3, tasks: 3, ungraded: 1, verdicts: 3, changed: 2 });
    expect(result.byCriterion).toEqual([{ criterion: "tone", verdicts: 3, changed: 2, passToFail: 2, failToPass: 0 }]);
    expect(result.changes.map((c) => c.taskId)).toEqual(["a"]);
  });
});
