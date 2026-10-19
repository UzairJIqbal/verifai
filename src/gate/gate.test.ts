import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { RunConfig } from "../eval/store";
import type { NoiseFloor } from "../results/schema";
import { compareRuns, type Noise, type NoiseSlice, type OutcomeRow } from "../stats/report";
import type { Category } from "../tasks/schema";
import { candidateKnobs, readCandidate, type Candidate } from "./candidates";
import { decideGate } from "./check";
import { agentKey, newestFloorFor, rescaleNoise } from "./floor";
import { addChangelogEntry, changelogEntry, gateComparison, listGates, rewriteConfigText, writeGateRecord } from "./record";
import type { GateRecord } from "./schema";

const dir = mkdtempSync(join(tmpdir(), "verifai-gate-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const tries = (taskId: string, category: Category, passes: number, n = 4): OutcomeRow[] =>
  Array.from({ length: n }, (_, i) => ({ taskId, category, difficulty: "easy", tryNumber: i + 1, passed: i < passes }));
// `count` tasks in a category, each passing `passes` of 4.
const tasks = (prefix: string, category: Category, count: number, passes: number) => Array.from({ length: count }, (_, i) => tries(`${prefix}-${i}`, category, passes)).flat();
const slice = (floor: number, t = 10): NoiseSlice => ({ tasks: t, outcomes: t * 4, flips: 0, flipRate: 0, floor });
const noise: Noise = { overall: slice(0.05), byCategory: { refund: slice(0.1), cancel: slice(0.1) } };

const promoted = { agentVersion: "v1", promptVersion: "v1", toolDescriptionsVersion: "v1", validation: null, exemplars: false };
const candidate = (change: Candidate["change"], extra: Partial<Candidate> = {}): Candidate => ({ name: "v2", basedOn: "v1", targets: "wrong-tool", why: "because", change, ...extra });

describe("candidates", () => {
  it("make the one change on top of the promoted version", () => {
    expect(candidateKnobs(candidate({ promptVersion: "v2" }), promoted)).toEqual({ promptVersion: "v2", toolDescriptionsVersion: "v1", validation: null, exemplars: false });
    expect(candidateKnobs(candidate({ validation: "refund-limit" }), promoted).validation).toBe("refund-limit");
  });

  it("refuse a stale base, a change to nothing, or two changes", () => {
    expect(() => candidateKnobs(candidate({ promptVersion: "v2" }, { basedOn: "v0" }), promoted)).toThrow(/based on v0/);
    expect(() => candidateKnobs(candidate({ exemplars: false }), promoted)).toThrow(/changes nothing/);
    writeFileSync(join(dir, "v2.json"), JSON.stringify({ ...candidate({ promptVersion: "v2" }), change: { promptVersion: "v2", exemplars: true } }));
    expect(() => readCandidate("v2", dir)).toThrow(/exactly one change/);
    writeFileSync(join(dir, "v3.json"), JSON.stringify(candidate({ promptVersion: "v2" })));
    expect(() => readCandidate("v3", dir)).toThrow(/says its name is v2/);
  });
});

describe("the noise floor for a gate", () => {
  const config = (over: Partial<RunConfig>): RunConfig => ({
    agent: { model: "m", pool: [{ provider: "groq", modelId: "m", prices: { input: 0, cachedInput: 0, output: 0 } }], temperature: 0, maxSteps: 12, stepTimeoutSeconds: 60, reasoningEffort: "low" },
    promptVersion: "v1",
    toolDescriptionsVersion: "v1",
    datasetVersion: "v1",
    split: "dev",
    smoke: false,
    triesPerTask: 4,
    useCache: false,
    agentHash: "a",
    tasksHash: "t",
    ...over,
  });

  it("ignores dataset, split, tasks and cache, but not the agent", () => {
    expect(agentKey(config({ datasetVersion: "v2", split: "holdout", tasksHash: "u", useCache: true }))).toBe(agentKey(config({})));
    expect(agentKey(config({ promptVersion: "v2" }))).not.toBe(agentKey(config({})));
    expect(agentKey(config({ validation: "refund-limit" }))).not.toBe(agentKey(config({})));
  });

  it("takes the newest floor measured for the same agent, on any dataset", () => {
    const floor = (run: string, measuredAt: string): NoiseFloor => ({ configKey: run, measuredAt, runs: [run, `${run}b`], datasetVersion: "v1", overall: slice(0.1), byCategory: {} });
    const configs: Record<string, RunConfig> = { old: config({}), new: config({ datasetVersion: "v2" }), other: config({ promptVersion: "v9" }) };
    const found = newestFloorFor(agentKey(config({})), [floor("old", "2026-10-01"), floor("new", "2026-10-10"), floor("other", "2026-10-20"), floor("gone", "2026-10-30")], (id) => configs[id] ?? null);
    expect(found?.floor.runs[0]).toBe("new");
  });

  it("rescales by the square root of the task counts", () => {
    const r = rescaleNoise({ overall: slice(0.1, 35), byCategory: { refund: slice(0.2, 7), cancel: slice(0.2, 7) } }, { overall: 15, byCategory: { refund: 3 } });
    expect(r.overall.floor).toBeCloseTo(0.1 * Math.sqrt(35 / 15), 12);
    expect(r.byCategory.refund?.floor).toBeCloseTo(0.2 * Math.sqrt(7 / 3), 12);
    // Holdout has no cancel here, so no cancel floor.
    expect(r.byCategory.cancel).toBeUndefined();
  });
});

describe("the gate decision", () => {
  const base = [...tasks("r", "refund", 8, 2), ...tasks("c", "cancel", 8, 4)];

  it("passes a clear holdout gain with no category dropping", () => {
    const holdout = compareRuns(base, [...tasks("r", "refund", 8, 4), ...tasks("c", "cancel", 8, 4)], noise);
    const dev = compareRuns(base, base, noise);
    const d = decideGate({ dev, holdout, maxDropPoints: 5 });
    expect(d.checks.find((c) => c.id === "holdout-better")?.pass).toBe(true);
    expect(d.pass).toBe(true);
  });

  it("fails when holdout is within noise, even if dev improved", () => {
    const better = [...tasks("r", "refund", 8, 4), ...tasks("c", "cancel", 8, 4)];
    const d = decideGate({ dev: compareRuns(base, better, noise), holdout: compareRuns(base, base, noise), maxDropPoints: 5 });
    expect(d.pass).toBe(false);
    expect(d.checks.find((c) => c.id === "holdout-better")?.pass).toBe(false);
  });

  it("fails when a dev category drops more than the threshold, and allows exactly the threshold", () => {
    const holdout = compareRuns(base, [...tasks("r", "refund", 8, 4), ...tasks("c", "cancel", 8, 4)], noise);
    // Every try of one of 8 cancel tasks fails on dev: 100% → 87.5%, a 12.5-point drop.
    const devRows = [...tasks("r", "refund", 8, 2), ...tasks("c", "cancel", 8, 4).map((r) => (r.taskId === "c-0" ? { ...r, passed: false } : r))];
    const d = decideGate({ dev: compareRuns(base, devRows, noise), holdout, maxDropPoints: 5 });
    expect(d.checks.find((c) => c.id === "dev-cancel")?.pass).toBe(false);
    expect(d.pass).toBe(false);
    expect(decideGate({ dev: compareRuns(base, devRows, noise), holdout, maxDropPoints: 12.5 }).checks.find((c) => c.id === "dev-cancel")?.pass).toBe(true);
  });

  it("fails when the two versions didn't run the same tasks", () => {
    const holdout = compareRuns(base, [...tasks("r", "refund", 8, 4), ...tasks("c", "cancel", 7, 4)], noise);
    const d = decideGate({ dev: compareRuns(base, base, noise), holdout, maxDropPoints: 5 });
    expect(d.checks.find((c) => c.id === "holdout-same-tasks")?.pass).toBe(false);
    expect(d.pass).toBe(false);
  });
});

describe("promotion files", () => {
  const configText = readFileSync(join(__dirname, "../../verifai.config.json"), "utf8");

  it("rewrites only the agent version keys, keeping the rest byte for byte", () => {
    const next = rewriteConfigText(configText, { agentVersion: "v2", promptVersion: "v1", toolDescriptionsVersion: "v1", validation: "refund-limit", exemplars: false });
    expect(next).toContain('"agentVersion": "v2"');
    expect(next).toContain('"validation": "refund-limit"');
    const changed = next.split("\n").filter((line, i) => line !== configText.split("\n")[i]);
    expect(changed).toHaveLength(2);
  });

  it("refuses a config where a key isn't there exactly once", () => {
    expect(() => rewriteConfigText('{"agentVersion": "v1"}', promoted)).toThrow(/promptVersion" 0 times/);
  });

  const comparison = compareRuns(tasks("r", "refund", 3, 2), tasks("r", "refund", 3, 4), rescaleNoise(noise, { overall: 3, byCategory: { refund: 3 } }));
  const record: GateRecord = {
    name: "v2",
    decidedAt: "2026-10-21T10:15:00.000Z",
    passed: true,
    promoted: true,
    basedOn: "v1",
    change: "validation step none → refund-limit",
    why: "Large refunds went out without a person.",
    targets: "wrong-tool",
    topCategory: "wrong-tool",
    promotedLabel: "prompt v1 · tools v1",
    candidateLabel: "prompt v1 · tools v1 · validation refund-limit",
    datasetVersion: "v3",
    triesPerTask: 4,
    runs: { promotedDev: "a", candidateDev: "b", promotedHoldout: "c", candidateHoldout: "d" },
    floor: { configKey: "k", measuredAt: "2026-10-20T00:00:00.000Z", datasetVersion: "v2", runs: ["x", "y"], tasks: 35, overall: 0.1 },
    dev: gateComparison(comparison),
    holdout: gateComparison(comparison),
    maxCategoryDropPoints: 5,
    checks: [],
  };

  it("saves the record and lists it back, newest first", () => {
    const gates = join(dir, "gates");
    writeGateRecord(record, gates);
    writeGateRecord({ ...record, name: "v3", decidedAt: "2026-10-22T10:15:00.000Z", passed: false, promoted: false }, gates);
    writeFileSync(join(gates, "bad.json"), "{");
    const { gates: listed, problems } = listGates(gates);
    expect(listed.map((g) => g.name)).toEqual(["v3", "v2"]);
    expect(problems).toHaveLength(1);
  });

  it("writes a changelog entry with the interval, sample size, floor and dataset, newest on top", () => {
    const entry = changelogEntry(record, "results/gates/x.json");
    expect(entry).toMatch(/^## v2 · 2026-10-21/);
    expect(entry).toContain("Dataset: v3");
    expect(entry).toMatch(/95% interval/);
    expect(entry).toContain("3 tasks × 4 tries");
    expect(entry).toContain("wrong-tool, the top category");
    const path = join(dir, "CHANGELOG.md");
    addChangelogEntry(entry, path);
    addChangelogEntry(changelogEntry({ ...record, name: "v3" }, "y"), path);
    const text = readFileSync(path, "utf8");
    expect(text.startsWith("# Changelog")).toBe(true);
    expect(text.indexOf("## v3")).toBeLessThan(text.indexOf("## v2"));
  });
});
