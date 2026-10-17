import { describe, expect, it } from "vitest";
import type { Claim, Trial } from "../results/schema";
import { hallucinationReport } from "./hallucination";

const claim = (step: number, label: Claim["label"]): Claim => ({ step, text: "c", label, evidence: "none", reason: "r" });

const trial = (taskId: string, o: { entity: boolean; replies: number; claims?: Claim[] | "ungraded"; errored?: boolean }): Trial => ({
  taskId,
  category: "status",
  difficulty: "easy",
  expectedTools: [],
  tryNumber: 1,
  status: o.errored ? "errored" : "passed",
  end: "answered",
  error: null,
  verdicts: o.errored
    ? []
    : [
        { grader: "fabricated-entity", pass: !o.entity, reason: "r", step: null, ungraded: false, spans: [] },
        { grader: "fabricated-action", pass: true, reason: "r", step: null, ungraded: false, spans: [] },
      ],
  calls: 1,
  cachedCalls: 0,
  usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
  costUsd: 0,
  modelLatencyMs: 0,
  startedAt: "2026-10-15T10:00:00.000Z",
  finishedAt: "2026-10-15T10:00:01.000Z",
  traceUrl: null,
  steps: Array.from({ length: o.replies }, (_, i) => ({ type: "text" as const, step: i, text: "r" })),
  claims:
    o.claims === undefined
      ? null
      : o.claims === "ungraded"
        ? { status: "ungraded", model: "m", promptVersion: "v1", reason: "not JSON" }
        : { status: "checked", model: "m", promptVersion: "v1", claims: o.claims },
});

describe("hallucination report", () => {
  it("counts code checks over every graded try, and leaves errored tries out", () => {
    const h = hallucinationReport([trial("a", { entity: true, replies: 1 }), trial("b", { entity: false, replies: 1 }), trial("b", { entity: false, replies: 1, errored: true })]);
    expect(h.fabricatedEntity).toMatchObject({ tasks: 2, tries: 2, hits: 1 });
    expect(h.fabricatedEntity.rate?.value).toBe(0.5);
    expect(h.fabricatedAction.hits).toBe(0);
    expect(h.claims).toBeNull();
  });

  it("counts replies with a bad claim and unsupported claims, and keeps couldn't-grade apart", () => {
    const h = hallucinationReport([
      // Two replies, one with an unsupported and a contradicted claim.
      trial("a", { entity: false, replies: 2, claims: [claim(0, "unsupported"), claim(0, "contradicted"), claim(1, "supported")] }),
      trial("b", { entity: false, replies: 1, claims: [claim(0, "supported")] }),
      trial("c", { entity: false, replies: 1, claims: "ungraded" }),
      trial("d", { entity: false, replies: 1 }),
    ]);
    expect(h.claims).toMatchObject({ judges: ["m · claims v1"], checkable: 4, checked: 2, ungraded: 1 });
    expect(h.claims?.responses).toMatchObject({ tasks: 2, tries: 2, replies: 3, flagged: 1 });
    expect(h.claims?.responses.rate?.value).toBeCloseTo(1 / 3);
    expect(h.claims?.claims).toMatchObject({ total: 4, unsupported: 1, contradicted: 1 });
    expect(h.claims?.claims.rate?.value).toBe(0.25);
  });

  it("gives the same interval every time", () => {
    const trials = ["a", "b", "c", "d"].map((id, i) => trial(id, { entity: i % 2 === 0, replies: 2, claims: [claim(0, i < 2 ? "unsupported" : "supported")] }));
    expect(hallucinationReport(trials)).toEqual(hallucinationReport(trials));
  });
});
