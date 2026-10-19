// `pnpm gate <candidate>`: the candidate against the promoted version, on dev
// and on holdout, same dataset, same tasks. Prints what it will spend and asks
// first. It passes only if holdout success beats the noise floor with McNemar
// agreeing, and no category drops by more than the config allows on either
// split. A pass promotes the candidate (config, changelog, its holdout tries
// readable); a fail changes nothing but its own record.
//
// This is the only code that loads holdout tasks.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { styleText } from "node:util";
import { loadConfig, PROJECT_ROOT, type Config } from "../src/config";
import { knobsLabel, knobsOf, type AgentKnobs } from "../src/agent/versions";
import { ask, budgetFor, dim, embeddingsToSend, executeRun, fatal, n, openSession, type Session, type SessionPlan } from "../src/eval/session";
import { runFingerprint } from "../src/eval/plan";
import type { RunConfig } from "../src/eval/store";
import { candidateKnobs, describeChange, readCandidate, type Candidate } from "../src/gate/candidates";
import { decideGate } from "../src/gate/check";
import { agentKey, newestFloorFor, rescaleNoise, type FloorSource } from "../src/gate/floor";
import { addChangelogEntry, CONFIG_FILE, changelogEntry, gateComparison, rewriteConfigText, writeGateRecord, type PromotedKnobs } from "../src/gate/record";
import type { GateRecord } from "../src/gate/schema";
import { readNoiseFloors } from "../src/results/read";
import { RESULT_FILES, type NoiseFloor } from "../src/results/schema";
import { withTaskInfo, writeResults } from "../src/results/write";
import { readNotes, readTags, readTaxonomy } from "../src/review/files";
import { taxonomyReport } from "../src/review/report";
import { compareRuns, outcomeRow, type Comparison, type Noise } from "../src/stats/report";
import { pct, points } from "../src/stats/format";
import { loadTasks, type LoadedTasks } from "../src/tasks/load";
import { CATEGORIES, type Category, type Task } from "../src/tasks/schema";

const USAGE = "Usage: pnpm gate <candidate>   (a file in agent/candidates/, e.g. pnpm gate v2)";

type Slot = { id: "promotedDev" | "candidateDev" | "promotedHoldout" | "candidateHoldout"; who: "promoted" | "candidate"; split: "dev" | "holdout"; plan: SessionPlan };

function counts(tasks: Task[]): { overall: number; byCategory: Partial<Record<Category, number>> } {
  const byCategory: Partial<Record<Category, number>> = {};
  for (const c of CATEGORIES) {
    const k = tasks.filter((t) => t.category === c).length;
    if (k > 0) byCategory[c] = k;
  }
  return { overall: tasks.length, byCategory };
}

// A finished run of exactly this agent on exactly these tasks, whose results
// files exist. Cache on or off doesn't matter, so a noise run counts.
function reusableRun(s: Session): string | null {
  const key = agentKey(s.runConfig);
  const same = (c: RunConfig) =>
    !c.smoke && c.split === s.runConfig.split && c.datasetVersion === s.runConfig.datasetVersion && c.tasksHash === s.runConfig.tasksHash && agentKey(c) === key;
  const found = s.store
    .finishedRuns()
    .filter((r) => same(r.config) && existsSync(join(PROJECT_ROOT, "results", r.id, RESULT_FILES.json)))
    .sort((a, b) => ((a.finishedAt ?? "") < (b.finishedAt ?? "") ? 1 : -1));
  return found[0]?.id ?? null;
}

// What a slot still has to spend, and (for dev) the newest noise floor
// measured for its agent.
type Estimate = { reuse: string | null; left: number; calls: number; embeddings: number; key: string; floor: FloorSource | null };

async function estimate(slot: Slot, floors: NoiseFloor[]): Promise<Estimate> {
  const s = await openSession({ useCache: true, smoke: false, plan: slot.plan });
  try {
    const key = agentKey(s.runConfig);
    const floor = slot.split === "dev" ? newestFloorFor(key, floors, (runId) => s.store.getRun(runId)?.config ?? null) : null;
    const reuse = reusableRun(s);
    if (reuse !== null) return { reuse, left: 0, calls: 0, embeddings: 0, key, floor };
    const unfinished = s.store.findUnfinishedRun(runFingerprint(s.runConfig));
    const done = unfinished === null ? 0 : s.store.finishedTries(unfinished.id).size;
    const left = s.tasks.length * s.runConfig.triesPerTask - done;
    // An upper bound: cached tries cost nothing, but with exemplars the cache
    // can't be checked before the embeddings, so they're counted here.
    const budget = budgetFor(s, left, 0);
    return { reuse: null, left, calls: budget.calls, embeddings: embeddingsToSend(s), key, floor };
  } finally {
    await s.close();
  }
}

function printComparison(title: string, c: Comparison): void {
  console.log(`\n  ${styleText("bold", title)} ${dim(`(${c.sharedTasks} tasks; promoted → candidate)`)}`);
  const row = (label: string, r: Comparison["overall"]) =>
    `  ${label.padEnd(9)} ${pct(r.aRate).padStart(6)} → ${pct(r.bRate).padStart(6)}  ${points(r.difference.value).padStart(6)} [${points(r.difference.lo)}, ${points(r.difference.hi)}]  ${dim(
      `${r.tasks} tasks · p ${r.mcnemar.p.toFixed(3)} · floor ${r.floor === null || Number.isNaN(r.floor) ? "–" : points(r.floor, false)}`,
    )}`;
  console.log(row("all", c.overall));
  for (const cat of CATEGORIES) {
    const r = c.byCategory[cat];
    if (r) console.log(row(cat, r));
  }
}

function promote(next: PromotedKnobs): void {
  const before = readFileSync(CONFIG_FILE, "utf8");
  writeFileSync(CONFIG_FILE, rewriteConfigText(before, next));
  try {
    loadConfig();
  } catch (error) {
    writeFileSync(CONFIG_FILE, before);
    throw new Error(`The rewritten config didn't load, so it was put back: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 1) fatal(USAGE);

  let config: Config;
  let candidate: Candidate;
  let promoted: PromotedKnobs;
  let next: AgentKnobs;
  let topCategory: string;
  let dev: LoadedTasks;
  let holdout: LoadedTasks;
  try {
    config = loadConfig();
    candidate = readCandidate(args[0]);
    promoted = { agentVersion: config.agentVersion, ...knobsOf(config) };
    next = candidateKnobs(candidate, promoted);
    const notes = readNotes();
    const report = taxonomyReport(notes, readTags(notes), readTaxonomy() ?? fatal("There's no failure taxonomy yet (evals/review/taxonomy.json), so no candidate can say what it targets."));
    if (report.top === null) fatal("The failure taxonomy has no tagged failures, so there's no top category to target.");
    topCategory = report.top.row.id;
    if (candidate.targets !== topCategory) {
      fatal(`${candidate.name} targets ${candidate.targets}, but the latest taxonomy's top category is ${topCategory}. Point it at ${topCategory}, or re-run \`pnpm taxonomy\` if the taxonomy is out of date.`);
    }
    dev = loadTasks();
    // The one place holdout tasks are loaded.
    holdout = loadTasks({ gating: true });
  } catch (error) {
    fatal(error instanceof Error ? error.message : String(error));
  }
  if (dev.version !== holdout.version) fatal("Dev and holdout came back with different dataset versions. This is a bug.");
  const devTaskIds = new Set(dev.tasks.map((t) => t.id));
  const promotedKnobs = knobsOf(promoted);

  const slots: Slot[] = [
    { id: "promotedDev", who: "promoted", split: "dev", plan: { split: "dev", knobs: promotedKnobs, loaded: dev } },
    { id: "candidateDev", who: "candidate", split: "dev", plan: { split: "dev", knobs: next, loaded: dev } },
    { id: "promotedHoldout", who: "promoted", split: "holdout", plan: { split: "holdout", knobs: promotedKnobs, loaded: holdout, devTaskIds } },
    { id: "candidateHoldout", who: "candidate", split: "holdout", plan: { split: "holdout", knobs: next, loaded: holdout, devTaskIds } },
  ];

  console.log(styleText("bold", `VerifAI gate · ${candidate.name} against ${promoted.agentVersion} · dataset ${dev.version}`));
  console.log(dim(`  change: ${describeChange(candidate.change, promotedKnobs)} · targets ${candidate.targets} (the taxonomy's top category)`));
  console.log(dim(`  promoted ${promoted.agentVersion}: ${knobsLabel(promotedKnobs)} · candidate ${candidate.name}: ${knobsLabel(next)}`));
  console.log(dim(`  ${dev.tasks.length} dev tasks and ${holdout.tasks.length} holdout tasks × ${config.runner.triesPerTask} tries, each version`));

  // The floor first: without one the gate can't pass, so nothing is spent.
  const { floors, problems } = readNoiseFloors();
  for (const p of problems) console.log(styleText("yellow", `⚠ ${p}`));
  const estimates: Estimate[] = [];
  for (const slot of slots) estimates.push(await estimate(slot, [...floors.values()]));
  const promotedFloor = estimates[0].floor;
  const floorSources = [estimates[0].floor, estimates[1].floor].filter((f): f is FloorSource => f !== null);
  if (!promotedFloor) {
    fatal(`There's no noise floor for the promoted version ${promoted.agentVersion} (${knobsLabel(promotedKnobs)}) on any dataset. Run \`pnpm noise\` first; the gate can't pass without one.`);
  }
  // Wider of the two, as in pnpm compare: nothing passes that either agent's
  // own noise could explain.
  const source = floorSources.reduce((a, b) => (b.floor.overall.floor > a.floor.overall.floor ? b : a));
  const measured: Noise = { overall: source.floor.overall, byCategory: source.floor.byCategory };
  const devNoise = rescaleNoise(measured, counts(dev.tasks));
  const holdoutNoise = rescaleNoise(measured, counts(holdout.tasks));
  console.log(
    dim(
      `  noise floor: ${points(source.floor.overall.floor, false)} points measured ${source.floor.measuredAt.slice(0, 10)} on dataset ${source.floor.datasetVersion} (${source.floor.overall.tasks} tasks, runs ${source.floor.runs.join(" and ")}, configuration ${source.floor.configKey}),` +
        ` rescaled to ${points(devNoise.overall.floor, false)} on dev and ${points(holdoutNoise.overall.floor, false)} on holdout`,
    ),
  );

  console.log(`\nEstimate ${dim("(rough; cached tries cost nothing and are worked out when each run starts)")}`);
  const labels: Record<Slot["id"], string> = { promotedDev: `${promoted.agentVersion} dev`, candidateDev: `${candidate.name} dev`, promotedHoldout: `${promoted.agentVersion} holdout`, candidateHoldout: `${candidate.name} holdout` };
  slots.forEach((slot, i) => {
    const e = estimates[i];
    console.log(
      `  ${labels[slot.id].padEnd(14)} ${
        e.reuse ? dim(`already run: ${e.reuse}`) : `${e.left} tries to go · up to ~${n(e.calls)} agent calls${e.embeddings > 0 ? ` · 1 embedding call (${e.embeddings} messages)` : ""}`
      }`,
    );
  });
  const totalCalls = estimates.reduce((a, e) => a + e.calls, 0);
  const totalEmbed = estimates.filter((e) => e.embeddings > 0).length;
  console.log(`  In all: up to ~${n(totalCalls)} agent calls${totalEmbed > 0 ? ` and ${totalEmbed} embedding call(s)` : ""} · 0 judge calls. It stops cleanly at the daily limit; \`pnpm gate ${candidate.name}\` carries on.\n`);

  if (totalCalls > 0 || totalEmbed > 0) {
    if (!process.stdin.isTTY) fatal(`pnpm gate asks before spending calls, so run it in a terminal.`);
    if (!(await ask("Start? [y/N] "))) return void console.log("Nothing sent.");
  }

  const runIds: Partial<Record<Slot["id"], string>> = {};
  for (const [i, slot] of slots.entries()) {
    const reuse = estimates[i].reuse;
    if (reuse) {
      runIds[slot.id] = reuse;
      continue;
    }
    console.log("");
    const s = await openSession({ useCache: true, smoke: false, plan: slot.plan });
    const outcome = await executeRun(s, { title: `gate · ${labels[slot.id]}`, command: `pnpm gate ${candidate.name}` });
    await s.close();
    if (!outcome.finished) {
      process.exitCode = 1;
      return;
    }
    runIds[slot.id] = outcome.run.id;
  }
  const ids = { promotedDev: runIds.promotedDev, candidateDev: runIds.candidateDev, promotedHoldout: runIds.promotedHoldout, candidateHoldout: runIds.candidateHoldout };
  if (!ids.promotedDev || !ids.candidateDev || !ids.promotedHoldout || !ids.candidateHoldout) fatal("A gate run has no id. This is a bug; nothing was decided.");
  const runs = { promotedDev: ids.promotedDev, candidateDev: ids.candidateDev, promotedHoldout: ids.promotedHoldout, candidateHoldout: ids.candidateHoldout };

  // Outcomes only (pass or fail per try), from the store, so a sealed holdout
  // run is compared without a trajectory being read.
  const last = await openSession({ useCache: true, smoke: false, plan: slots[3].plan });
  const devById = new Map(dev.tasks.map((t) => [t.id, t]));
  const holdoutById = new Map(holdout.tasks.map((t) => [t.id, t]));
  const rows = (runId: string, byId: Map<string, Task>) => withTaskInfo(last.store.loadTrials(runId), byId).map(outcomeRow);
  const devCmp = compareRuns(rows(runs.promotedDev, devById), rows(runs.candidateDev, devById), devNoise);
  const holdoutCmp = compareRuns(rows(runs.promotedHoldout, holdoutById), rows(runs.candidateHoldout, holdoutById), holdoutNoise);
  const decision = decideGate({ dev: devCmp, holdout: holdoutCmp, maxDropPoints: config.gate.maxCategoryDropPoints });

  printComparison("Holdout", holdoutCmp);
  printComparison("Dev", devCmp);
  console.log("");
  for (const c of decision.checks) console.log(`  ${c.pass ? styleText("green", "pass") : styleText("red", "FAIL")}  ${c.label} ${dim(`· ${c.detail}`)}`);

  const record: GateRecord = {
    name: candidate.name,
    decidedAt: new Date().toISOString(),
    passed: decision.pass,
    promoted: false,
    basedOn: candidate.basedOn,
    change: describeChange(candidate.change, promotedKnobs),
    why: candidate.why,
    targets: candidate.targets,
    topCategory,
    promotedLabel: knobsLabel(promotedKnobs),
    candidateLabel: knobsLabel(next),
    datasetVersion: dev.version,
    triesPerTask: config.runner.triesPerTask,
    runs,
    floor: {
      configKey: source.floor.configKey,
      measuredAt: source.floor.measuredAt,
      datasetVersion: source.floor.datasetVersion,
      runs: source.floor.runs,
      tasks: source.floor.overall.tasks,
      overall: source.floor.overall.floor,
    },
    dev: gateComparison(devCmp),
    holdout: gateComparison(holdoutCmp),
    maxCategoryDropPoints: config.gate.maxCategoryDropPoints,
    checks: decision.checks,
  };

  if (!decision.pass) {
    const path = writeGateRecord(record);
    await last.close();
    console.log(styleText(["red", "bold"], `\n✗ ${candidate.name} failed the gate. Nothing was changed; ${promoted.agentVersion} stays promoted.`));
    console.log(dim(`  Record: ${relative(PROJECT_ROOT, path)} · holdout tries stay sealed.`));
    process.exitCode = 1;
    return;
  }

  // Promotion, in an order where a failure halfway is loud and fixable: the
  // config, then the holdout files unsealed, then the changelog.
  try {
    promote({ agentVersion: candidate.name, ...next });
    const stored = last.store.getRun(runs.candidateHoldout);
    if (stored === null || stored.finishedAt === null) throw new Error(`run ${runs.candidateHoldout} isn't finished in the eval store`);
    writeResults(stored, last.store.loadTrials(stored.id), holdoutById, stored.finishedAt, last.redact, undefined, candidate.name);
    const path = writeGateRecord({ ...record, promoted: true });
    addChangelogEntry(changelogEntry({ ...record, promoted: true }, relative(PROJECT_ROOT, path)));
    console.log(styleText(["green", "bold"], `\n✓ ${candidate.name} passed and is promoted. verifai.config.json now runs it; its holdout tries are readable.`));
    console.log(dim(`  Record: ${relative(PROJECT_ROOT, path)} · CHANGELOG.md has its entry.`));
  } catch (error) {
    writeGateRecord(record);
    await last.close();
    fatal(`${candidate.name} passed, but promoting it broke: ${error instanceof Error ? error.message : String(error)}. Check verifai.config.json and CHANGELOG.md before running anything else.`);
  }
  await last.close();
}

void main();
