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
import { reportSchema, sealedTrialSchema, trialSchema, type Trial } from "./schema";
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

const trial = (tryNumber: number, status: Trial["status"]): Trial => ({
  taskId: "status-01",
  category: "status",
  tryNumber,
  status,
  end: status === "errored" ? null : "answered",
  error: status === "errored" ? "timed out" : null,
  verdicts: status === "errored" ? [] : [{ grader: "state", pass: true, reason: "nothing changed" }],
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

describe("results files", () => {
  it("writes a dev run in full, with errored tries counted as not passed", () => {
    const trials = [trial(1, "passed"), trial(2, "failed"), trial(3, "errored")];
    writeResults(runFor("dev", "dev-run"), trials, "2026-10-15T11:00:00.000Z", redact, dir);
    const report = reportSchema.parse(JSON.parse(read("dev-run", "report.json")));
    expect(report.totals).toMatchObject({ trials: 3, passed: 1, failed: 1, errored: 1 });
    const lines = read("dev-run", "trials.jsonl").trim().split("\n").map((l) => trialSchema.parse(JSON.parse(l)));
    expect(lines).toHaveLength(3);
    expect(read("dev-run", "report.md")).toContain("1/3 tries passed");
    expect(read("dev-run", "trials.jsonl")).not.toContain("gsk_secretkey123");
    expect(report.smoke).toBe(false);
  });

  it("labels a smoke run as one and gives it no success rate", () => {
    writeResults(runFor("dev", "smoke-run", true), [trial(1, "passed"), trial(2, "failed")], "2026-10-15T11:00:00.000Z", redact, dir);
    expect(reportSchema.parse(JSON.parse(read("smoke-run", "report.json"))).smoke).toBe(true);
    const md = read("smoke-run", "report.md");
    expect(md).toContain("# Smoke run smoke-run");
    expect(md).toContain("never a score");
    expect(md).not.toContain("Success rate");
  });

  it("writes a holdout run as outcomes only: no steps, reasons or trace links", () => {
    writeResults(runFor("holdout", "holdout-run"), [trial(1, "passed")], "2026-10-15T11:00:00.000Z", redact, dir);
    const raw = read("holdout-run", "trials.jsonl");
    const sealed = JSON.parse(raw.trim());
    expect(sealedTrialSchema.strict().safeParse(sealed).success).toBe(true);
    expect(raw).not.toContain("Where is order");
    expect(raw).not.toContain("nothing changed");
    expect(raw).not.toContain("langfuse");
  });
});
