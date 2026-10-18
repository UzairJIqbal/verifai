import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadConfig } from "../config";
import { loadAgentVersion } from "../agent/versions";
import { buildRunConfig } from "../eval/plan";
import { makeRedactor } from "../eval/redact";
import type { StoredRun } from "../eval/store";
import { taskSchema } from "../tasks/schema";
import { reportSchema, sealedTrialSchema, trialSchema, type RecordedTrial } from "./schema";
import { writeResults } from "./write";

const dir = mkdtempSync(join(tmpdir(), "verifai-results-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const config = loadConfig();
const version = loadAgentVersion(config, "2026-03-15");
const task = taskSchema.parse({
  id: "status-01",
  split: "dev",
  category: "status",
  difficulty: "easy",
  adversarial: false,
  note: "test",
  first_message: "Where is order 1005?",
  canned_replies: [],
  expected: { changes: [] },
  reference: [],
});

const trial = (tryNumber: number, status: RecordedTrial["status"], taskId = "status-01"): RecordedTrial => ({
  taskId,
  category: "status",
  tryNumber,
  status,
  end: status === "errored" ? null : "answered",
  error: status === "errored" ? "timed out" : null,
  verdicts: status === "errored" ? [] : [{ grader: "state", pass: true, reason: "nothing changed", step: null, ungraded: false, spans: [] }],
  calls: 1,
  cachedCalls: 0,
  usage: { inputTokens: 100, cachedInputTokens: 0, outputTokens: 10 },
  costUsd: 0.001,
  modelLatencyMs: 300,
  startedAt: "2026-10-15T10:00:00.000Z",
  finishedAt: "2026-10-15T10:00:01.000Z",
  traceUrl: "https://cloud.langfuse.com/project/p/traces/t",
  steps: [
    { type: "customer", text: "Where is order 1005? key gsk_secretkey123" },
    { type: "text", step: 1, text: "It's processing." },
  ],
  claims: null,
  judge: null,
});

function runFor(split: "dev" | "holdout", id: string, smoke = false): StoredRun {
  return {
    id,
    createdAt: "2026-10-15T10:00:00.000Z",
    finishedAt: null,
    status: "running",
    config: buildRunConfig({ config, version, datasetVersion: "v1", split, tasks: [task], useCache: true, smoke }),
  };
}

const read = (id: string, file: string) => readFileSync(join(dir, id, file), "utf8");
const redact = makeRedactor(["gsk_secretkey123"]);
const tasks = new Map([
  ["status-01", task],
  ["status-02", taskSchema.parse({ ...task, id: "status-02", difficulty: "hard" })],
]);

describe("results files", () => {
  it("writes a dev run in full, with errored tries counted as not passed", () => {
    const trials = [trial(1, "passed"), trial(2, "failed"), trial(3, "errored")];
    writeResults(runFor("dev", "dev-run"), trials, tasks, "2026-10-15T11:00:00.000Z", redact, dir);
    const report = reportSchema.parse(JSON.parse(read("dev-run", "report.json")));
    expect(report.totals).toMatchObject({ trials: 3, passed: 1, failed: 1, errored: 1 });
    const lines = read("dev-run", "trials.jsonl").trim().split("\n").map((l) => trialSchema.parse(JSON.parse(l)));
    expect(lines).toHaveLength(3);
    expect(read("dev-run", "report.md")).toContain("1/3 tries passed");
    expect(read("dev-run", "trials.jsonl")).not.toContain("gsk_secretkey123");
    expect(report.smoke).toBe(false);
    expect(lines.every((l) => l.difficulty === "easy")).toBe(true);
  });

  it("reports the success rate, pass^k and pass@k, by category and difficulty", () => {
    // status-01 passes 2 of 4, status-02 passes 4 of 4.
    const trials = [
      ...[1, 2, 3, 4].map((i) => trial(i, i <= 2 ? "passed" : "failed")),
      ...[1, 2, 3, 4].map((i) => trial(i, "passed", "status-02")),
    ];
    const { report } = writeResults(runFor("dev", "stats-run"), trials, tasks, "2026-10-15T11:00:00.000Z", redact, dir);
    const stats = report.stats;
    if (!stats) throw new Error("a dev run has stats");
    expect(stats.overall).toMatchObject({ tasks: 2, tries: 8, passed: 6 });
    expect(stats.overall.passHat[0].value).toBeCloseTo(0.75, 12);
    // pass^2: (1/6 + 1) / 2; pass@2: (5/6 + 1) / 2.
    expect(stats.overall.passHat[1].value).toBeCloseTo(7 / 12, 12);
    expect(stats.overall.passAt[1].value).toBeCloseTo(11 / 12, 12);
    expect(stats.overall.passHat).toHaveLength(4);
    expect(stats.byDifficulty.easy?.passHat[0].value).toBe(0.5);
    expect(stats.byDifficulty.hard?.passHat[0].value).toBe(1);
    expect(stats.byCategory.status?.tasks).toBe(2);
    const md = read("stats-run", "report.md");
    expect(md).toContain("Success rate 75.0%");
    expect(md).toContain("pass^4");
  });

  it("refuses a try whose task difficulty it doesn't know", () => {
    expect(() => writeResults(runFor("dev", "x-run"), [trial(1, "passed", "status-99")], tasks, "2026-10-15T11:00:00.000Z", redact, dir)).toThrow(/status-99/);
  });

  it("labels a smoke run as one and gives it no success rate", () => {
    writeResults(runFor("dev", "smoke-run", true), [trial(1, "passed"), trial(2, "failed")], tasks, "2026-10-15T11:00:00.000Z", redact, dir);
    expect(reportSchema.parse(JSON.parse(read("smoke-run", "report.json"))).smoke).toBe(true);
    const md = read("smoke-run", "report.md");
    expect(md).toContain("# Smoke run smoke-run");
    expect(md).toContain("never a score");
    expect(md).not.toContain("Success rate");
  });

  it("writes a holdout run as outcomes only: no steps, reasons or trace links", () => {
    writeResults(runFor("holdout", "holdout-run"), [trial(1, "passed")], tasks, "2026-10-15T11:00:00.000Z", redact, dir);
    const raw = read("holdout-run", "trials.jsonl");
    const sealed = JSON.parse(raw.trim());
    expect(sealedTrialSchema.strict().safeParse(sealed).success).toBe(true);
    expect(raw).not.toContain("Where is order");
    expect(raw).not.toContain("nothing changed");
    expect(raw).not.toContain("langfuse");
  });
});

describe("the trajectory grader section", () => {
  const graded = (tryNumber: number, verdicts: RecordedTrial["verdicts"], steps: RecordedTrial["steps"]): RecordedTrial => ({
    ...trial(tryNumber, "passed"),
    verdicts,
    steps,
  });
  const v = (grader: string, pass: boolean, ungraded = false) => ({ grader, pass, reason: "r", step: null, ungraded, spans: [] });
  const call = (toolName: string) => ({ type: "tool-call" as const, step: 1, toolCallId: toolName, toolName, input: {} });

  it("counts couldn't-grade apart from passes, and per-tool precision and recall", () => {
    const withRef = new Map([["status-01", taskSchema.parse({ ...task, reference: [{ tool: "get_order", input: { order_id: 1005 } }] })]]);
    const trials = [
      graded(1, [v("loop", true), v("policy:look-up-first", false)], [call("get_order")]),
      graded(2, [v("loop", false), v("policy:look-up-first", true, true)], [call("get_order"), call("cancel_order")]),
    ];
    const { report } = writeResults(runFor("dev", "graders-run"), trials, withRef, "2026-10-15T11:00:00.000Z", redact, dir);
    const g = report.graders;
    if (!g) throw new Error("a dev run has a grader section");
    expect(g.graders.find((r) => r.grader === "policy:look-up-first")).toMatchObject({ graded: 1, passed: 0, ungraded: 1 });
    // A grader with no verdict on a try didn't run there: couldn't grade, never a pass.
    expect(g.graders.find((r) => r.grader === "state")).toMatchObject({ graded: 0, ungraded: 2, rate: null });
    expect(g.tools).toHaveLength(7);
    expect(g.tools.find((t) => t.tool === "get_order")).toMatchObject({ called: 2, expected: 2, both: 2, precision: { value: 1 }, recall: { value: 1 } });
    expect(g.tools.find((t) => t.tool === "cancel_order")).toMatchObject({ called: 1, expected: 0, precision: { value: 0 }, recall: null });
    expect(g.efficiency).toMatchObject({ loops: 1, toolCalls: { value: 1.5 }, reference: { value: 1 } });
    expect(read("graders-run", "report.md")).toContain("## Trajectory graders");
    const lines = read("graders-run", "trials.jsonl").trim().split("\n").map((l) => trialSchema.parse(JSON.parse(l)));
    expect(lines[0].expectedTools).toEqual(["get_order"]);
  });
});
