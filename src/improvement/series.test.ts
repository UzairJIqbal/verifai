// Made-up gates, runs and review notes only: nothing here reads or writes
// results/, the changelog or the review files.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { chartSvg } from "../../components/improvement/export";
import { ImprovementChart, PAGE_PALETTE } from "../../components/improvement/improvement-chart";
import { loadAgentVersion } from "../agent/versions";
import { loadConfig } from "../config";
import { buildRunConfig } from "../eval/plan";
import type { StoredRun } from "../eval/store";
import { gateComparison } from "../gate/record";
import type { GateRecord } from "../gate/schema";
import { buildReport, withTaskInfo } from "../results/write";
import type { CallCost, RecordedTrial, Trial } from "../results/schema";
import type { Note, Tag, Taxonomy } from "../review/schema";
import { compareRuns } from "../stats/report";
import { taskSchema, type Task } from "../tasks/schema";
import { improvementSeries, type ImprovementInput, type RunData } from "./series";

const config = loadConfig();
const version = loadAgentVersion(config, "2026-03-15");
const task = (id: string): Task =>
  taskSchema.parse({
    id,
    split: "dev",
    category: "refund",
    difficulty: "easy",
    adversarial: false,
    note: "made up",
    first_message: "I want a refund.",
    canned_replies: [],
    expected: { changes: [] },
    reference: [],
  });
const tasks = new Map(["refund-01", "refund-02"].map((id) => [id, task(id)]));

const cost = (usd: number): CallCost => ({ usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 }, costUsd: usd });

type TryOptions = { costed?: boolean; flagged?: boolean };
const trial = (taskId: string, tryNumber: number, status: RecordedTrial["status"], o: TryOptions = {}): RecordedTrial => {
  const costed = o.costed ?? true;
  return {
    taskId,
    category: "refund",
    tryNumber,
    status,
    end: status === "errored" ? null : "answered",
    error: status === "errored" ? "timed out" : null,
    verdicts: [],
    calls: 1,
    cachedCalls: 0,
    usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
    costUsd: 0.01,
    modelLatencyMs: 0,
    startedAt: "2026-10-15T10:00:00.000Z",
    finishedAt: "2026-10-15T10:00:01.000Z",
    traceUrl: null,
    steps: [
      { type: "customer", text: "I want a refund." },
      { type: "text", step: 1, text: "Done." },
    ],
    claims:
      status === "errored"
        ? null
        : {
            status: "checked",
            model: "judge",
            promptVersion: "v1",
            claims: o.flagged ? [{ step: 1, text: "Done.", label: "unsupported", evidence: "none", reason: "made up" }] : [],
            ...(costed ? { cost: cost(0.002) } : {}),
          },
    judge: status === "errored" ? null : { status: "judged", model: "judge", rubricVersion: "v1", verdicts: [], ...(costed ? { cost: cost(0.003) } : {}) },
  };
};

function runData(id: string, split: "dev" | "holdout", recorded: RecordedTrial[]): RunData {
  const run: StoredRun = {
    id,
    createdAt: "2026-10-15T10:00:00.000Z",
    finishedAt: null,
    status: "running",
    config: buildRunConfig({ config, version, datasetVersion: "v3", split, tasks: [...tasks.values()], useCache: true, smoke: false }),
  };
  const trials: Trial[] = withTaskInfo(recorded, tasks);
  return { report: buildReport(run, trials, "2026-10-15T11:00:00.000Z", tasks), trials: split === "holdout" ? null : trials };
}

const comparison = gateComparison(compareRuns([], [], null));
const gate = (o: Partial<GateRecord> & Pick<GateRecord, "name" | "basedOn" | "decidedAt" | "runs">): GateRecord => ({
  passed: true,
  promoted: true,
  change: "a change",
  why: "a reason",
  targets: "wrong-tool",
  topCategory: "wrong-tool",
  promotedLabel: `${o.basedOn} knobs`,
  candidateLabel: `${o.name} knobs`,
  datasetVersion: "v3",
  triesPerTask: 2,
  floor: { configKey: "k", measuredAt: "2026-10-01T00:00:00.000Z", datasetVersion: "v3", runs: ["x", "y"], tasks: 2, overall: 0.1 },
  dev: comparison,
  holdout: comparison,
  maxCategoryDropPoints: 5,
  checks: [],
  ...o,
});

const taxonomy: Taxonomy = {
  writtenAt: "2026-10-10T00:00:00.000Z",
  categories: ["wrong-tool", "bad-policy", "made-up-fact", "gave-up", "task-wrong"].map((id) => ({ id, name: `${id} name`, definition: "made up" })),
};
const note = (runId: string, taskId: string, tryNumber: number): Note => ({ runId, taskId, tryNumber, taskCategory: "refund", datasetVersion: "v3", note: "went wrong", notedAt: "2026-10-16T00:00:00.000Z" });
const tag = (n: Note, category: string, taggedAt = "2026-10-16T01:00:00.000Z"): Tag => ({ runId: n.runId, taskId: n.taskId, tryNumber: n.tryNumber, category, taggedAt });

// v1 fails three tries (two tagged wrong-tool, one not reviewed), v2 one.
const runs = new Map<string, RunData>([
  ["dev-v1", runData("dev-v1", "dev", [trial("refund-01", 1, "failed", { flagged: true }), trial("refund-01", 2, "failed"), trial("refund-02", 1, "passed"), trial("refund-02", 2, "failed")])],
  ["hold-v1", runData("hold-v1", "holdout", [trial("refund-01", 1, "failed"), trial("refund-01", 2, "failed"), trial("refund-02", 1, "passed"), trial("refund-02", 2, "failed")])],
  ["dev-v2", runData("dev-v2", "dev", [trial("refund-01", 1, "passed"), trial("refund-01", 2, "passed"), trial("refund-02", 1, "passed"), trial("refund-02", 2, "failed")])],
  ["hold-v2", runData("hold-v2", "holdout", [trial("refund-01", 1, "passed"), trial("refund-01", 2, "failed"), trial("refund-02", 1, "passed"), trial("refund-02", 2, "passed")])],
]);
const v2 = gate({ name: "v2", basedOn: "v1", decidedAt: "2026-10-17T00:00:00.000Z", runs: { promotedDev: "dev-v1", candidateDev: "dev-v2", promotedHoldout: "hold-v1", candidateHoldout: "hold-v2" } });
const failed = gate({ name: "v2b", basedOn: "v1", decidedAt: "2026-10-16T00:00:00.000Z", passed: false, promoted: false, runs: v2.runs });
const notes = [note("dev-v1", "refund-01", 1), note("dev-v1", "refund-01", 2), note("dev-v2", "refund-02", 2)];

const input = (o: Partial<ImprovementInput> = {}): ImprovementInput => ({
  gates: [v2, failed],
  run: (id) => runs.get(id) ?? `Run ${id} isn't in results/.`,
  // Each version's runs share a configuration; the two versions don't.
  configKeys: new Map([
    ["dev-v1", "config-v1"],
    ["hold-v1", "config-v1-holdout"],
    ["dev-v2", "config-v2"],
    ["hold-v2", "config-v2-holdout"],
  ]),
  notes,
  // The first try was tagged gave-up, then retagged: the newest tag counts.
  tags: [tag(notes[0], "gave-up", "2026-10-16T00:30:00.000Z"), tag(notes[0], "wrong-tool"), tag(notes[1], "wrong-tool"), tag(notes[2], "bad-policy")],
  taxonomy,
  ...o,
});

describe("improvement series", () => {
  it("draws the base version and each promoted one, and only lists the failed gate", () => {
    const out = improvementSeries(input());
    expect(out.versions.map((v) => [v.version, v.devRunId, v.holdoutRunId])).toEqual([
      ["v1", "dev-v1", "hold-v1"],
      ["v2", "dev-v2", "hold-v2"],
    ]);
    expect(out.notPromoted.map((g) => g.name)).toEqual(["v2b"]);
    expect(out.problems).toEqual([]);
  });

  it("takes holdout success from the holdout run, with its interval and sample size", () => {
    const [v1, v2p] = improvementSeries(input()).versions;
    expect(v1.holdout).toMatchObject({ ok: true, tasks: 2, tries: 4, estimate: { value: 0.25 } });
    expect(v2p.holdout).toMatchObject({ ok: true, estimate: { value: 0.75 } });
    if (!v2p.holdout.ok) throw new Error("expected a point");
    expect(v2p.holdout.estimate.lo).toBeLessThanOrEqual(0.75);
    expect(v2p.holdout.estimate.hi).toBeGreaterThanOrEqual(0.75);
  });

  it("takes the hallucination rate from the dev run's flagged replies", () => {
    const [v1, v2p] = improvementSeries(input()).versions;
    expect(v1.hallucination).toMatchObject({ ok: true, replies: 4, flagged: 1, estimate: { value: 0.25 } });
    expect(v2p.hallucination).toMatchObject({ ok: true, flagged: 0, estimate: { value: 0 } });
  });

  it("prices every try's agent, claim-checker and judge calls over the tries that passed", () => {
    const [v1, v2p] = improvementSeries(input()).versions;
    // Four tries at 0.01 + 0.002 + 0.003 each.
    expect(v1.cost).toMatchObject({ ok: true, passed: 1, tries: 4, tasks: 2 });
    if (!v1.cost.ok || !v2p.cost.ok) throw new Error("expected points");
    expect(v1.cost.totalUsd).toBeCloseTo(0.06);
    expect(v1.cost.estimate.value).toBeCloseTo(0.06);
    expect(v2p.cost.estimate.value).toBeCloseTo(0.02);
  });

  it("won't show a cost when a check's tokens weren't saved, rather than show the agent's alone", () => {
    const partial = new Map(runs);
    partial.set("dev-v2", runData("dev-v2", "dev", [trial("refund-01", 1, "passed", { costed: false }), trial("refund-02", 1, "passed")]));
    const [, v2p] = improvementSeries(input({ run: (id) => partial.get(id) ?? "missing" })).versions;
    expect(v2p.cost).toMatchObject({ ok: false, reason: expect.stringContaining("token counts") });
  });

  it("won't show a cost or a rate until the judge and claim checker have read every try", () => {
    const unread = new Map(runs);
    const bare = [trial("refund-01", 1, "passed"), trial("refund-02", 1, "failed")].map((t) => ({ ...t, claims: null, judge: null }));
    unread.set("dev-v2", runData("dev-v2", "dev", bare));
    const [, v2p] = improvementSeries(input({ run: (id) => unread.get(id) ?? "missing" })).versions;
    expect(v2p.cost).toMatchObject({ ok: false, reason: expect.stringContaining("pnpm judge dev-v2") });
    expect(v2p.hallucination).toMatchObject({ ok: false, reason: expect.stringContaining("pnpm claims dev-v2") });
  });

  it("counts each version's failed dev tries by their newest tag, and the rest as not reviewed", () => {
    const [v1, v2p] = improvementSeries(input()).versions;
    expect(v1.categories).toMatchObject({ ok: true, failures: 3, reviewed: 2, notReviewed: 1 });
    if (!v1.categories.ok || !v2p.categories.ok) throw new Error("expected counts");
    expect(v1.categories.rows.map((r) => [r.id, r.count])).toEqual([
      ["wrong-tool", 2],
      ["bad-policy", 0],
      ["made-up-fact", 0],
      ["gave-up", 0],
      ["task-wrong", 0],
    ]);
    expect(v2p.categories.rows.find((r) => r.id === "wrong-tool")?.count).toBe(0);
    expect(v2p.categories.rows.find((r) => r.id === "bad-policy")?.count).toBe(1);
  });

  it("counts a tag the taxonomy no longer has as not reviewed", () => {
    const [v1] = improvementSeries(input({ tags: [tag(notes[0], "retired-category")] })).versions;
    expect(v1.categories).toMatchObject({ ok: true, reviewed: 0, notReviewed: 3 });
  });

  it("links each promoted version to the tagged failures of the version before it", () => {
    const [v1, v2p] = improvementSeries(input()).versions;
    expect(v1.targets).toBeNull();
    expect(v2p.targets).toBe("wrong-tool");
    // dev-v2's wrong-tool failure is the new version's, so it isn't one.
    const later = improvementSeries(input({ tags: [...input().tags, tag(notes[2], "wrong-tool", "2026-10-17T00:00:00.000Z")] })).versions[1];
    expect(later.examples.map((e) => e.runId)).toEqual(["dev-v1", "dev-v1"]);
    expect(v2p.examples).toEqual([
      { runId: "dev-v1", taskId: "refund-01", tryNumber: 1 },
      { runId: "dev-v1", taskId: "refund-01", tryNumber: 2 },
    ]);
  });

  it("refuses to place a promoted gate that wasn't built on the version before it", () => {
    const stray = gate({ name: "v3", basedOn: "v9", decidedAt: "2026-10-18T00:00:00.000Z", runs: v2.runs });
    const out = improvementSeries(input({ gates: [v2, stray] }));
    expect(out.versions.map((v) => v.version)).toEqual(["v1", "v2"]);
    expect(out.problems).toEqual([expect.stringContaining("v3 was promoted on top of v9")]);
  });

  it("says when a gate passed but promotion broke, and when versions were gated on different datasets", () => {
    const broken = gate({ name: "v3", basedOn: "v2", decidedAt: "2026-10-18T00:00:00.000Z", promoted: false, runs: v2.runs });
    const v3 = gate({ name: "v3", basedOn: "v2", decidedAt: "2026-10-19T00:00:00.000Z", datasetVersion: "v4", runs: v2.runs });
    const out = improvementSeries(input({ gates: [v2, broken, v3] }));
    expect(out.notPromoted.map((g) => g.name)).toEqual(["v3"]);
    expect(out.problems).toEqual([expect.stringContaining("wasn't promoted"), expect.stringContaining("different datasets")]);
  });

  it("draws nothing before the first promotion, and says plainly why a run is missing", () => {
    expect(improvementSeries(input({ gates: [failed] })).versions).toEqual([]);
    const [v1] = improvementSeries(input({ run: () => "Run gone isn't in results/." })).versions;
    expect(v1.holdout).toEqual({ ok: false, reason: "Run gone isn't in results/." });
    const [noTaxonomy] = improvementSeries(input({ taxonomy: null })).versions;
    expect(noTaxonomy.categories).toMatchObject({ ok: false, reason: expect.stringContaining("pnpm taxonomy") });
  });

  it("exports the page's chart with only its colours changed", () => {
    const { versions } = improvementSeries(input());
    const file = chartSvg(versions);
    const page = renderToStaticMarkup(createElement(ImprovementChart, { versions, palette: PAGE_PALETTE }));
    const shape = (svg: string) => svg.replace(/ style="[^"]*"/g, "");
    expect(file.startsWith("<?xml")).toBe(true);
    expect(shape(file.slice(file.indexOf("<svg")).trim())).toBe(shape(page));
    // Fixed colours only: an image has no theme to read variables from.
    expect(file).not.toContain("var(--");
    expect(file).toContain("75.0%");
    expect(file).toContain("aimed at wrong-tool name");
  });
});
