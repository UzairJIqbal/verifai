import { describe, expect, it } from "vitest";
import { agreementReport } from "./agreement";
import type { JudgeSnapshot, Label } from "./schema";

const RUN = "20261016-000000-0000";

const label = (taskId: string, split: Label["split"], refusal: boolean, claims: Label["claims"] = []): Label => ({
  runId: RUN,
  taskId,
  tryNumber: 1,
  split,
  rubricVersion: "v1 · aaaaaa",
  claimsPromptVersion: "v1",
  labelledAt: "2026-10-18T00:00:00.000Z",
  criteria: [{ criterion: "refusal-explained", pass: refusal }],
  claims,
});

const judged = (taskId: string, pass: boolean, rubric = "v1 · aaaaaa", at = "2026-10-18T00:00:00.000Z"): JudgeSnapshot => ({
  kind: "judge",
  runId: RUN,
  taskId,
  tryNumber: 1,
  recordedAt: at,
  check: { status: "judged", model: "m", rubricVersion: rubric, verdicts: [{ criterion: "refusal-explained", pass, reason: "r" }] },
});

const CURRENT = { judge: "m · rubric v1 · aaaaaa", claims: "m · claims v1" };

describe("agreementReport", () => {
  it("counts a failure the judge caught as a true positive, per split", () => {
    const labels = [label("a", "judge-test", false), label("b", "judge-test", true), label("c", "judge-dev", true)];
    const snaps = [judged("a", false), judged("b", true), judged("c", false)];
    const report = agreementReport(labels, snaps, CURRENT);
    const [v] = report.versions;
    const test = v.bySplit["judge-test"].rows.find((r) => r.name === "all criteria")!;
    expect(test.agreement).toMatchObject({ truePositives: 1, trueNegatives: 1, falsePositives: 0, falseNegatives: 0, tpr: 1, tnr: 1 });
    expect(test.tasks).toBe(2);
    // judge-dev mistakes are listed; judge-test ones never are.
    expect(report.devMistakes).toHaveLength(1);
    expect(report.devMistakes[0]).toMatchObject({ taskId: "c", yours: "pass", judges: "fail" });
  });

  it("leaves an ungraded verdict out and counts it", () => {
    const snap: JudgeSnapshot = { kind: "judge", runId: RUN, taskId: "a", tryNumber: 1, recordedAt: "t", check: { status: "ungraded", model: "m", rubricVersion: "v1 · aaaaaa", reason: "bad json" } };
    const report = agreementReport([label("a", "judge-test", false)], [snap], CURRENT);
    const split = report.versions[0].bySplit["judge-test"];
    expect(split).toMatchObject({ trials: 1, ungraded: 1 });
    expect(split.rows.every((r) => r.agreement === null)).toBe(true);
  });

  it("compares a later rubric with the first on judge-test trials both read", () => {
    const labels = [label("a", "judge-test", false), label("b", "judge-test", true)];
    const snaps = [judged("a", true), judged("b", true), judged("a", false, "v2 · bbbbbb", "2026-10-19T00:00:00.000Z")];
    const [cmp] = agreementReport(labels, snaps, CURRENT).comparisons;
    expect(cmp.trials).toBe(1);
    const all = cmp.rows.find((r) => r.name === "all criteria")!;
    expect(all.before.agreement?.falseNegatives).toBe(1);
    expect(all.after.agreement?.truePositives).toBe(1);
  });

  it("matches claims by step and words and fills the 3×3 matrix", () => {
    const claims: Label["claims"] = [
      { step: 3, text: "Your order shipped.", label: "contradicted" },
      { step: 3, text: "It arrives Friday.", label: "supported" },
      { step: 5, text: "Not in the checker's list.", label: "supported" },
    ];
    const snap: JudgeSnapshot = {
      kind: "claims",
      runId: RUN,
      taskId: "a",
      tryNumber: 1,
      recordedAt: "t",
      check: {
        status: "checked",
        model: "m",
        promptVersion: "v1",
        claims: [
          { step: 3, text: "Your order shipped.", label: "unsupported", evidence: "", reason: "r" },
          { step: 3, text: "It arrives Friday.", label: "supported", evidence: "", reason: "r" },
        ],
      },
    };
    const split = agreementReport([label("a", "judge-test", true, claims)], [snap], CURRENT).versions[0].bySplit["judge-test"];
    expect(split.unmatchedClaims).toBe(1);
    const [row] = split.rows;
    expect(row.items).toBe(2);
    // Contradicted by you, unsupported by the checker: still a caught claim.
    expect(row.agreement).toMatchObject({ truePositives: 1, trueNegatives: 1 });
    expect(row.matrix).toEqual([
      [1, 0, 0],
      [0, 0, 1],
      [0, 0, 0],
    ]);
  });
});
