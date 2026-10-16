// Writes results/<run>/ from the eval store: the record the dashboard reads.
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_ROOT } from "../config";
import { configKey } from "../eval/plan";
import type { RunConfig, StoredRun } from "../eval/store";
import type { Redact } from "../eval/redact";
import type { Task } from "../tasks/schema";
import { TOOL_NAMES } from "../agent/tools";
import { GRADERS } from "../graders";
import { expectedTools } from "../graders/tool-choice";
import { POLICY_RULES } from "../graders/policy";
import { outcomeRow, runStats, type RunStats, type Slice } from "../stats/report";
import { graderReport } from "../stats/graders";
import { flipped, pct, sampleSize, withInterval } from "../stats/format";
import type { Estimate } from "../stats/stats";
import {
  NOISE_FLOORS_FILE,
  noiseFloorSchema,
  RESULT_FILES,
  reportSchema,
  sealedTrialSchema,
  trialSchema,
  type GraderReport,
  type NoiseFloor,
  type RecordedTrial,
  type Report,
  type SealedTrial,
  type Trial,
} from "./schema";

export const RESULTS_DIR = join(PROJECT_ROOT, "results");

// The store keeps tries without their task's difficulty and expected tools;
// they're added from the tasks the run was given. A try whose task isn't
// there is a bug, so it stops.
export function withTaskInfo(trials: RecordedTrial[], tasks: Map<string, Task>): Trial[] {
  return trials.map((t) => {
    const task = tasks.get(t.taskId);
    if (task === undefined) throw new Error(`Task ${t.taskId} has a saved try but isn't among the run's tasks, so its difficulty is unknown.`);
    return { ...t, difficulty: task.difficulty, expectedTools: expectedTools(task) };
  });
}

function countByProvider(trials: Trial[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of trials) for (const s of t.steps) if (s.type === "model") counts[s.provider] = (counts[s.provider] ?? 0) + 1;
  return counts;
}

export function buildReport(run: StoredRun, trials: Trial[], finishedAt: string, tasks: Map<string, Task>): Report {
  const c: RunConfig = run.config;
  const sum = (pick: (t: Trial) => number) => trials.reduce((total, t) => total + pick(t), 0);
  return reportSchema.parse({
    runId: run.id,
    createdAt: run.createdAt,
    finishedAt,
    split: c.split,
    smoke: c.smoke,
    datasetVersion: c.datasetVersion,
    taskCount: new Set(trials.map((t) => t.taskId)).size,
    triesPerTask: c.triesPerTask,
    useCache: c.useCache,
    configKey: configKey(c),
    agent: {
      pool: c.agent.pool.map((m) => m.provider),
      model: c.agent.model,
      temperature: c.agent.temperature,
      maxSteps: c.agent.maxSteps,
      reasoningEffort: c.agent.reasoningEffort,
      promptVersion: c.promptVersion,
      toolDescriptionsVersion: c.toolDescriptionsVersion,
    },
    totals: {
      trials: trials.length,
      passed: trials.filter((t) => t.status === "passed").length,
      failed: trials.filter((t) => t.status === "failed").length,
      errored: trials.filter((t) => t.status === "errored").length,
      calls: sum((t) => t.calls),
      cachedCalls: sum((t) => t.cachedCalls),
      callsByProvider: countByProvider(trials),
      usage: {
        inputTokens: sum((t) => t.usage.inputTokens),
        cachedInputTokens: sum((t) => t.usage.cachedInputTokens),
        outputTokens: sum((t) => t.usage.outputTokens),
      },
      costUsd: sum((t) => t.costUsd),
    },
    stats: c.smoke ? null : runStats(trials.map(outcomeRow)),
    graders: c.smoke
      ? null
      : graderReport({
          trials,
          graders: GRADERS,
          policyRules: POLICY_RULES,
          tools: TOOL_NAMES,
          referenceLength: new Map([...tasks].map(([id, task]) => [id, task.reference.length])),
        }),
  });
}

// A holdout try keeps its outcome and loses everything that could be learned
// from: no steps, no reasons, no trace link.
export function sealTrial(trial: Trial): SealedTrial {
  return sealedTrialSchema.parse({
    taskId: trial.taskId,
    category: trial.category,
    difficulty: trial.difficulty,
    tryNumber: trial.tryNumber,
    status: trial.status,
    verdicts: trial.verdicts.map((v) => ({ grader: v.grader, pass: v.pass, ungraded: v.ungraded })),
  });
}

// One row per slice: its size, success rate, then pass^k and pass@k for every k.
export function statsTable(stats: RunStats): { header: string[]; rows: string[][] } {
  const ks = stats.overall.passHat.map((_, i) => i + 1);
  const row = (label: string, s: Slice) => [label, String(s.tasks), String(s.tries), `${s.passed}/${s.tries}`, ...s.passHat.map(withInterval), ...s.passAt.map(withInterval)];
  return {
    header: ["", "tasks", "tries", "passed", ...ks.map((k) => `pass^${k}`), ...ks.map((k) => `pass@${k}`)],
    rows: [
      row("all", stats.overall),
      ...Object.entries(stats.byCategory).map(([c, s]) => row(c, s)),
      ...Object.entries(stats.byDifficulty).map(([d, s]) => row(d, s)),
    ],
  };
}

const orDash = (e: Estimate | null) => (e === null ? "–" : withInterval(e));
const averageWithInterval = (e: Estimate | null) => (e === null ? "–" : `${e.value.toFixed(2)} (${e.lo.toFixed(2)}–${e.hi.toFixed(2)})`);

// The trajectory graders as tables, the same in the terminal and report.md.
export function graderTables(g: GraderReport): { title: string; header: string[]; rows: string[][] }[] {
  const policy = g.graders.filter((r) => POLICY_RULES.some((rule) => rule === r.grader));
  return [
    {
      title: "Graders: pass rate over the tries each could grade",
      // Failed, not passed, beside the pass rate: the same as the run page, so
      // a count and its rate never read as the same thing twice.
      header: ["grader", "tasks", "graded", "failed", "couldn't grade", "pass rate"],
      rows: g.graders.map((r) => [r.grader, String(r.tasks), String(r.graded), `${r.graded - r.passed}/${r.graded}`, String(r.ungraded), orDash(r.rate)]),
    },
    {
      title: "Policy: violation rate, overall and per rule",
      header: ["rule", "tasks", "graded", "violated", "violation rate"],
      rows: [
        ["any rule", String(g.policy.tasks), String(g.policy.tries), `${g.policy.violated}/${g.policy.tries}`, orDash(g.policy.rate)],
        ...policy.map((r) => [r.grader.replace("policy:", ""), String(r.tasks), String(r.graded), `${r.graded - r.passed}/${r.graded}`, orDash(flipped(r.rate))]),
      ],
    },
    {
      title: "Tools: precision (calls that were needed) and recall (needed tools that were called)",
      header: ["tool", "called", "needed", "both", "precision", "recall"],
      rows: g.tools.map((t) => [t.tool, String(t.called), String(t.expected), String(t.both), orDash(t.precision), orDash(t.recall)]),
    },
    {
      title: "Efficiency",
      header: ["", "tasks", "tries", "value"],
      rows: [
        ["tool calls per try", String(g.efficiency.tasks), String(g.efficiency.tries), averageWithInterval(g.efficiency.toolCalls)],
        ["reference calls per try", String(g.efficiency.tasks), String(g.efficiency.tries), averageWithInterval(g.efficiency.reference)],
        ["loop rate", String(g.efficiency.tasks), String(g.efficiency.tries), `${orDash(g.efficiency.loopRate)} · ${g.efficiency.loops} tries looped`],
      ],
    },
  ];
}

// The success rate as one line: the headline of every report.
export function successLine(stats: RunStats): string {
  const s = stats.overall;
  return `Success rate ${withInterval(s.passHat[0])}: ${s.passed}/${s.tries} tries passed, from ${sampleSize(s)}.`;
}

export function renderMarkdown(report: Report, trials: Trial[]): string {
  const { totals: t, agent: a } = report;
  const outcome = report.stats
    ? [
        `**${successLine(report.stats)}** ${t.failed} failed, ${t.errored} errored; errored tries count as not passed.`,
        "",
        "Every number is averaged over tasks, with its 95% interval in brackets: tasks were resampled with replacement 10,000 times (seeded, so it's the same every time). pass^k is the chance k tries of a task all pass; pass@k the chance at least one does. pass^1 is the success rate.",
        "",
        ...(() => {
          const { header, rows } = statsTable(report.stats);
          return [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.join(" | ")} |`)];
        })(),
      ]
    : [
        `**Smoke run: ${t.passed} of ${t.trials} tries passed, ${t.failed} failed, ${t.errored} errored.** It checks that the machinery works; it's never a score, a comparison or a gate.`,
      ];
  const graders = report.graders
    ? [
        "",
        "## Trajectory graders",
        "",
        `How each try got to its result, reported beside the success rate and never part of it. ${report.graders.tries} tries from ${report.graders.tasks} tasks; ${report.graders.errored} errored tries aren't graded. Rates are averaged over tasks with 95% intervals.`,
        ...graderTables(report.graders).flatMap((table) => [
          "",
          `### ${table.title}`,
          "",
          `| ${table.header.join(" | ")} |`,
          `| ${table.header.map(() => "---").join(" | ")} |`,
          ...table.rows.map((r) => `| ${r.join(" | ")} |`),
        ]),
      ]
    : [];
  const lines = [
    `# ${report.smoke ? "Smoke run" : "Run"} ${report.runId}`,
    "",
    `- Split: ${report.split}${report.smoke ? " (smoke)" : ""} · dataset ${report.datasetVersion} · ${report.taskCount} tasks × ${report.triesPerTask} tries = ${t.trials} tries`,
    `- Agent: ${a.model} from ${a.pool.join(", then ")} · temperature ${a.temperature} · reasoning ${a.reasoningEffort} · prompt ${a.promptVersion} · tools ${a.toolDescriptionsVersion} · max ${a.maxSteps} steps`,
    `- Configuration key: ${report.configKey}`,
    `- Response cache: ${report.useCache ? "on" : "off"}`,
    `- Started ${report.createdAt} · finished ${report.finishedAt}`,
    "",
    ...outcome,
    ...graders,
    "",
    `Model calls: ${t.calls} (${t.cachedCalls} replayed from the cache; ${Object.entries(t.callsByProvider).map(([p, n]) => `${n} from ${p}`).join(", ") || "none"}) · tokens in ${t.usage.inputTokens} (${t.usage.cachedInputTokens} cached) · out ${t.usage.outputTokens} · cost $${t.costUsd.toFixed(4)} at list price`,
    "",
    "## By task",
    "",
    "| Task | Category | Difficulty | Passed | Errored |",
    "| --- | --- | --- | --- | --- |",
  ];
  const byTask = new Map<string, Trial[]>();
  for (const trial of trials) byTask.set(trial.taskId, [...(byTask.get(trial.taskId) ?? []), trial]);
  for (const [taskId, tries] of byTask) {
    const passed = tries.filter((x) => x.status === "passed").length;
    const errored = tries.filter((x) => x.status === "errored").length;
    lines.push(`| ${taskId} | ${tries[0].category} | ${tries[0].difficulty} | ${passed}/${tries.length} (${pct(passed / tries.length)}) | ${errored} |`);
  }
  return `${lines.join("\n")}\n`;
}

export function writeResults(
  run: StoredRun,
  recorded: RecordedTrial[],
  tasks: Map<string, Task>,
  finishedAt: string,
  redact: Redact,
  dir: string = RESULTS_DIR,
): { dir: string; report: Report } {
  const trials = withTaskInfo(recorded, tasks);
  const report = buildReport(run, trials, finishedAt, tasks);
  const runDir = join(dir, run.id);
  mkdirSync(runDir, { recursive: true });
  const lines = trials.map((trial) => JSON.stringify(report.split === "holdout" ? sealTrial(trial) : trialSchema.parse(trial)));
  writeFileSync(join(runDir, RESULT_FILES.json), redact(`${JSON.stringify(report, null, 2)}\n`));
  writeFileSync(join(runDir, RESULT_FILES.markdown), redact(renderMarkdown(report, trials)));
  writeFileSync(join(runDir, RESULT_FILES.trials), redact(lines.length === 0 ? "" : `${lines.join("\n")}\n`));
  return { dir: runDir, report };
}

// Appended, never rewritten: a configuration measured twice keeps both, and
// the newest is the one that counts.
export function appendNoiseFloor(floor: NoiseFloor, dir: string = RESULTS_DIR): void {
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, NOISE_FLOORS_FILE), `${JSON.stringify(noiseFloorSchema.parse(floor))}\n`);
}
