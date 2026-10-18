import { describe, expect, it } from "vitest";
import type { JudgeCheck, JudgeCriterion, Trial } from "../results/schema";
import { judgeReport } from "./judge";

const trial = (taskId: string, judge: JudgeCheck | null, o: { replies?: number; errored?: boolean } = {}): Trial => ({
  taskId,
  category: "cancel",
  difficulty: "easy",
  expectedTools: [],
  tryNumber: 1,
  status: o.errored ? "errored" : "passed",
  end: "answered",
  error: null,
  verdicts: [],
  calls: 1,
  cachedCalls: 0,
  usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
  costUsd: 0,
  modelLatencyMs: 0,
  startedAt: "2026-10-15T10:00:00.000Z",
  finishedAt: "2026-10-15T10:00:01.000Z",
  traceUrl: null,
  steps: Array.from({ length: o.replies ?? 1 }, (_, i) => ({ type: "text" as const, step: i, text: "r" })),
  claims: null,
  judge,
});

const judged = (...v: [JudgeCriterion, boolean][]): JudgeCheck => ({
  status: "judged",
  model: "m",
  rubricVersion: "v1 · abc123",
  verdicts: v.map(([criterion, pass]) => ({ criterion, pass, reason: "r" })),
});
const ungraded: JudgeCheck = { status: "ungraded", model: "m", rubricVersion: "v1 · abc123", reason: "not JSON" };

describe("judge report", () => {
  it("is null until the judge has read a try", () => {
    expect(judgeReport([trial("a", null)])).toBeNull();
  });

  it("counts each criterion over only the tries it was asked about, and ungraded apart", () => {
    const r = judgeReport([
      trial("a", judged(["refusal-explained", false], ["tone", true])),
      trial("b", judged(["tone", false])),
      trial("c", ungraded),
      trial("d", null),
      trial("e", null, { replies: 0 }),
      trial("f", null, { errored: true }),
    ]);
    expect(r).toMatchObject({ judges: ["m · rubric v1 · abc123"], judgeable: 4, judged: 2, ungraded: 1 });
    expect(r?.criteria.map((c) => [c.criterion, c.tasks, c.tries, c.passed])).toEqual([
      ["refusal-explained", 1, 1, 0],
      ["tone", 2, 2, 1],
    ]);
    expect(r?.criteria[1].rate?.value).toBe(0.5);
  });
});
