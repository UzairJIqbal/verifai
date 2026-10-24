// Grading a recorded run again without a model: each try's tool calls run on a
// fresh shop to rebuild what it changed, and today's graders read the result.
// `pnpm regrade` does it from the eval store; `pnpm eval --replay` does it from
// a committed results folder, so a fresh clone can check a committed number
// with no key and no call.
import { canonical } from "../canonical";
import { loadToolDescriptions, offeredTools } from "../agent/versions";
import { runTool, type ToolName } from "../agent/tools";
import { gradeTry, outcomePassed } from "../graders";
import { loadShopFacts } from "../graders/shop-facts";
import { gradedSections } from "../results/write";
import { reportSchema, verdictSchema, type RecordedTrial, type Report, type Step, type Trial } from "../results/schema";
import type { RunFiles } from "../results/read";
import { getShopToday, openFreshShop, SEED_DB_PATH } from "../shop/db";
import { diffShops, dumpShop } from "../shop/diff";
import type { LoadedTasks } from "../tasks/load";
import type { Trajectory, TrajectoryEvent } from "./trajectory";

// A recorded step is the event it was made from, with its cost added.
const toEvent = (s: Step): TrajectoryEvent => s;

// What the try left the shop looking like, from its own tool calls run again.
// Tools are deterministic over the seed and the frozen date, so a different
// outcome means the shop or a tool changed since the run, and its grades
// would be about something that never happened.
export function replayTrial(trial: RecordedTrial, offered: readonly ToolName[], seedPath: string = SEED_DB_PATH): Trajectory {
  const shop = openFreshShop(seedPath);
  try {
    const ctx = { db: shop.db, today: getShopToday(shop.db) };
    const before = dumpShop(shop.db);
    const calls = new Map(trial.steps.flatMap((s) => (s.type === "tool-call" ? [[s.toolCallId, s] as const] : [])));
    for (const s of trial.steps) {
      if (s.type !== "tool-result") continue;
      const call = calls.get(s.toolCallId);
      if (!call) throw new Error(`${trial.taskId} try ${trial.tryNumber}: a ${s.toolName} result has no call.`);
      const outcome = runTool(ctx, call.toolName, call.input, offered);
      if (canonical(outcome) !== canonical(s.outcome)) {
        throw new Error(
          `${trial.taskId} try ${trial.tryNumber}: replaying ${call.toolName} ${canonical(call.input)} gave ${canonical(outcome)}, but the run recorded ${canonical(s.outcome)}. ` +
            "The shop or a tool has changed since this run, so it can't be regraded. Run `pnpm eval` for a new one.",
        );
      }
    }
    if (trial.end === null) throw new Error(`${trial.taskId} try ${trial.tryNumber} has no end recorded.`);
    return { events: trial.steps.map(toEvent), end: trial.end, changes: diffShops(before, dumpShop(shop.db)) };
  } finally {
    shop.dispose();
  }
}

// A try whose grades came out different from the file: either its status, or
// any grader's pass or "couldn't grade".
export type ReplayDifference = { taskId: string; tryNumber: number; recorded: string; replayed: string };

export type Replayed = { report: Report; differences: ReplayDifference[] };

const gist = (t: Pick<Trial, "status" | "verdicts">): string =>
  canonical({ status: t.status, verdicts: t.verdicts.map((v) => ({ grader: v.grader, pass: v.pass, ungraded: v.ungraded })) });

// Throws when the run can't be replayed honestly: a holdout run (graded once,
// by the gate), a smoke run (never a score), or one on other tasks than today's.
export function replayRunFiles(files: RunFiles, loaded: LoadedTasks, args: { policy: string; seedPath?: string }): Replayed {
  const { report } = files;
  if (report.split !== "dev") throw new Error(`${report.runId} is a holdout run. It's graded once, by the gate, and never replayed.`);
  // A dev run is never sealed; the check is for the type.
  if (files.sealed) throw new Error(`${report.runId} is sealed.`);
  if (report.smoke) throw new Error(`${report.runId} is a smoke run. It checks the machinery and has no score; replay a full \`pnpm eval\` run.`);
  if (report.datasetVersion !== loaded.version) {
    throw new Error(`${report.runId} was run on dataset ${report.datasetVersion}, and the tasks are now ${loaded.version}. It can only be replayed against the tasks it ran on.`);
  }

  const tasksById = new Map(loaded.tasks.map((t) => [t.id, t]));
  const seedPath = args.seedPath ?? SEED_DB_PATH;
  const shop = loadShopFacts(seedPath);
  // Replayed with the tools the run's agent had, so a call to one its version
  // left out fails again, as it did in the run.
  const offered = offeredTools(loadToolDescriptions(report.agent.toolDescriptionsVersion));

  const differences: ReplayDifference[] = [];
  const trials: Trial[] = files.trials.map((trial) => {
    const task = tasksById.get(trial.taskId);
    if (!task) throw new Error(`${report.runId} has tries of ${trial.taskId}, which isn't a dev task in dataset ${loaded.version}.`);
    if (task.category !== trial.category || task.difficulty !== trial.difficulty) {
      throw new Error(`${trial.taskId} has changed since ${report.runId} ran, without a new dataset version. Bump the version in evals/tasks.jsonl.`);
    }
    // An errored try never finished, so there's nothing to grade.
    if (trial.status === "errored") return trial;
    const verdicts = gradeTry(task, replayTrial(trial, offered, seedPath), shop, args.policy).map((v) => verdictSchema.parse(v));
    const replayed: Trial = { ...trial, status: outcomePassed(verdicts) ? "passed" : "failed", verdicts };
    if (gist(replayed) !== gist(trial)) differences.push({ taskId: trial.taskId, tryNumber: trial.tryNumber, recorded: gist(trial), replayed: gist(replayed) });
    return replayed;
  });

  const rebuilt = reportSchema.parse({
    ...report,
    totals: {
      ...report.totals,
      passed: trials.filter((t) => t.status === "passed").length,
      failed: trials.filter((t) => t.status === "failed").length,
    },
    ...gradedSections(false, trials, tasksById),
  });
  return { report: rebuilt, differences };
}
