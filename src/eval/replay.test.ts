import { afterAll, describe, expect, it } from "vitest";
import { loadConfig } from "../config";
import { loadAgentVersion, loadPolicy, preCheckOf } from "../agent/versions";
import { runTool, TOOL_NAMES } from "../agent/tools";
import { CANCEL_REFERENCE, taskWith, testShop } from "../graders/fixtures";
import type { RunFiles } from "../results/read";
import type { Step, Trial } from "../results/schema";
import { buildReport, withTaskInfo } from "../results/write";
import { getShopToday, openFreshShop } from "../shop/db";
import type { LoadedTasks } from "../tasks/load";
import { gradeTry } from "../graders";
import { loadShopFacts } from "../graders/shop-facts";
import { verdictSchema } from "../results/schema";
import { buildRunConfig } from "./plan";
import { replayRunFiles, replayTrial } from "./replay";

const { seedPath, dispose } = testShop("replay");
afterAll(dispose);

const config = loadConfig();
const version = loadAgentVersion(config, "2026-03-15");
const policy = loadPolicy();
const task = taskWith(CANCEL_REFERENCE);
const loaded: LoadedTasks = { version: "v1", tasks: [task], holdoutCounts: { cancel: 0, refund: 0, address: 0, status: 0, transfer: 0 } };

// A try that follows the reference, with each result as the tool really gives it.
function recordedSteps(): Step[] {
  const shop = openFreshShop(seedPath);
  try {
    const ctx = { db: shop.db, today: getShopToday(shop.db) };
    const steps: Step[] = [{ type: "customer", text: task.first_message }];
    CANCEL_REFERENCE.forEach((call, i) => {
      const id = `call-${i}`;
      steps.push({ type: "tool-call", step: i, toolCallId: id, toolName: call.tool, input: call.input });
      steps.push({ type: "tool-result", step: i, toolCallId: id, toolName: call.tool, outcome: runTool(ctx, call.tool, call.input), startedAt: 0, latencyMs: 0 });
    });
    steps.push({ type: "text", step: CANCEL_REFERENCE.length, text: "Order 1005 is cancelled." });
    return steps;
  } finally {
    shop.dispose();
  }
}

function filesWith(trial: Partial<Trial>, report: { split?: "dev" | "holdout"; smoke?: boolean; datasetVersion?: string } = {}): Extract<RunFiles, { sealed: false }> {
  const runConfig = buildRunConfig({ config, version, datasetVersion: report.datasetVersion ?? "v1", split: report.split ?? "dev", tasks: [task], useCache: true, smoke: report.smoke ?? false });
  const recorded = {
    taskId: task.id,
    category: task.category,
    tryNumber: 1,
    status: "failed" as const,
    end: "answered" as const,
    error: null,
    verdicts: [],
    calls: 4,
    cachedCalls: 0,
    usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
    costUsd: 0,
    modelLatencyMs: 0,
    startedAt: "2026-10-24T00:00:00.000Z",
    finishedAt: "2026-10-24T00:00:01.000Z",
    traceUrl: null,
    steps: recordedSteps(),
    claims: null,
    judge: null,
  };
  const tasks = new Map([[task.id, task]]);
  const trials = withTaskInfo([recorded], tasks).map((t) => ({ ...t, ...trial }));
  const run = { id: "run-replay-test", createdAt: "2026-10-24T00:00:00.000Z", finishedAt: "2026-10-24T00:00:01.000Z", status: "finished" as const, config: runConfig };
  return { report: buildReport(run, trials, run.finishedAt, tasks), sealed: false, trials };
}

// The verdicts today's graders give the file's one try.
function gradedVerdicts(files: RunFiles): Trial["verdicts"] {
  if (files.sealed) throw new Error("A test run is never sealed.");
  return gradeTry(task, replayTrial(files.trials[0], TOOL_NAMES, null, seedPath), loadShopFacts(seedPath), policy).map((v) => verdictSchema.parse(v));
}

describe("replaying a committed run", () => {
  it("grades the try again with no model and says when the file's grades differ", () => {
    // The file says failed with no verdicts; the replayed try cancels 1005 and passes.
    const stale = filesWith({});
    const first = replayRunFiles(stale, loaded, { policy, seedPath });
    expect(first.report.totals.passed).toBe(1);
    expect(first.report.stats?.overall.passHat[0].value).toBe(1);
    expect(first.differences).toHaveLength(1);
    expect(first.differences[0]).toMatchObject({ taskId: task.id, tryNumber: 1 });

    // Written back with those grades, a second replay matches it exactly.
    const graded = filesWith({ status: "passed", verdicts: gradedVerdicts(stale) });
    const second = replayRunFiles(graded, loaded, { policy, seedPath });
    expect(second.differences).toEqual([]);
    expect(second.report.stats).toEqual(graded.report.stats);
  });

  it("stops when a recorded tool result isn't what the tool gives now", () => {
    const files = filesWith({});
    const steps = files.trials[0].steps.map((s) => (s.type === "tool-result" && s.toolName === "cancel_order" ? { ...s, outcome: { ok: false as const, error: "made up" } } : s));
    const changed: RunFiles = { ...files, trials: [{ ...files.trials[0], steps }] };
    expect(() => replayRunFiles(changed, loaded, { policy, seedPath })).toThrow(/The shop or a tool has changed/);
  });

  it("replays a call the run's validation step refused as refused again", () => {
    const refundLimit = preCheckOf({ validation: "refund-limit" });
    if (refundLimit === null) throw new Error("refund-limit has no pre-check.");
    const input = { order_id: 1005, amount: 20000, reason: "Faulty" };
    const refused = refundLimit.check(input);
    if (refused === null) throw new Error("The refund limit let Rs 20,000 through.");
    const steps: Step[] = [
      { type: "customer", text: task.first_message },
      { type: "tool-call", step: 0, toolCallId: "call-0", toolName: "refund_order", input },
      { type: "tool-result", step: 0, toolCallId: "call-0", toolName: "refund_order", outcome: refused, startedAt: 0, latencyMs: 0 },
    ];
    const trial = { ...filesWith({}).trials[0], steps };
    expect(replayTrial(trial, TOOL_NAMES, refundLimit, seedPath).changes).toEqual(replayTrial({ ...trial, steps: [] }, TOOL_NAMES, null, seedPath).changes);
    expect(() => replayTrial(trial, TOOL_NAMES, null, seedPath)).toThrow(/The shop or a tool has changed/);
  });

  it("never replays a holdout run, a smoke run, or a run on another dataset version", () => {
    expect(() => replayRunFiles(filesWith({}, { split: "holdout" }), loaded, { policy, seedPath })).toThrow(/holdout run/);
    expect(() => replayRunFiles(filesWith({}, { smoke: true }), loaded, { policy, seedPath })).toThrow(/smoke run/);
    expect(() => replayRunFiles(filesWith({}, { datasetVersion: "v9" }), loaded, { policy, seedPath })).toThrow(/dataset v9/);
  });
});
