// `pnpm noise`: the dev split twice with the cache off and nothing else
// changed, to see how much the score moves on its own. Prints the cost and asks
// first; stops cleanly at the daily limit and carries the same pair on next
// time. The flip rate and noise floor are saved for this configuration.
import { createInterface } from "node:readline/promises";
import { styleText } from "node:util";
import { budgetFor, compact, dim, executeRun, fatal, n, openSession, printProviders, remainingTries } from "../src/eval/session";
import { measureNoise, outcomeRow } from "../src/stats/report";
import { pct, points } from "../src/stats/format";
import { appendNoiseFloor, withDifficulty } from "../src/results/write";
import type { NoiseFloor } from "../src/results/schema";

const COMMAND = "pnpm noise";

async function ask(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function main(): Promise<void> {
  if (process.argv.length > 2) fatal(`pnpm noise takes no options.\nUsage: ${COMMAND}`);
  const s = await openSession({ useCache: false, smoke: false });
  const { store, configKey } = s;
  const measurement = store.noiseMeasurement(configKey) ?? { configKey, runA: null, runB: null };
  const isFinished = (id: string | null) => id !== null && store.getRun(id)?.status === "finished";

  // What's left across both runs: the first's remaining tries, then all of
  // the second's (or what it has left).
  const a = remainingTries(s, measurement.runA);
  const b = isFinished(measurement.runA) ? remainingTries(s, measurement.runB) : remainingTries(s, null);
  const total = s.tasks.length * s.runConfig.triesPerTask;
  const budget = budgetFor(s, a.left + b.left, 0);
  const perDay = budget.providers.reduce((sum, p) => sum + p.callsPerDay, 0);

  console.log(styleText("bold", `VerifAI noise · configuration ${configKey} · ${s.tasks.length} dev tasks × ${s.runConfig.triesPerTask} tries, twice, cache off`));
  console.log(dim(`  agent ${s.version.label} · ${s.config.agent.model} · temperature ${s.config.agent.temperature} · dataset ${s.loaded.version}`));
  console.log(dim("  Two identical runs: whatever differs between them is noise, not the agent."));
  if (measurement.runA !== null) {
    console.log(dim(`  carrying on: run 1 ${measurement.runA} (${total - a.left}/${total} done)${measurement.runB ? ` · run 2 ${measurement.runB} (${total - b.left}/${total} done)` : ""}`));
  }
  console.log(`\nEstimate ${dim("(rough; \"today\" is the last 24 hours, by our own count)")}`);
  console.log(`  ${a.left + b.left} tries to go across both runs · ~${n(budget.calls)} calls, ~${compact(budget.countedTokens)} tokens, every one sent (no cache)`);
  printProviders(s, budget);
  console.log(
    budget.fitsToday
      ? "  Fits in what's left of today."
      : styleText("yellow", `  About ${budget.days} days of the free limit (~${n(perDay)} calls a day). It stops cleanly each day; \`${COMMAND}\` carries on.`),
  );
  console.log("  Gemini (judge): 0 calls\n");

  if (!process.stdin.isTTY) {
    await s.close();
    fatal(`${COMMAND} asks before spending calls, so run it in a terminal.`);
  }
  if (!(await ask("Start? [y/N] "))) {
    console.log("Nothing sent.");
    await s.close();
    return;
  }

  // Each run is saved to the measurement as soon as it exists, so a stop
  // halfway carries on the same pair. A run already finished isn't run again.
  for (const slot of ["runA", "runB"] as const) {
    if (isFinished(measurement[slot])) continue;
    console.log("");
    const other = slot === "runA" ? measurement.runB : measurement.runA;
    const outcome = await executeRun(s, { title: `noise run ${slot === "runA" ? 1 : 2} of 2`, command: COMMAND, notRun: other ?? undefined });
    measurement[slot] = outcome.run.id;
    store.saveNoiseMeasurement(measurement);
    if (!outcome.finished) {
      process.exitCode = 1;
      return void (await s.close());
    }
  }
  const { runA, runB } = measurement;
  if (runA === null || runB === null || runA === runB) {
    await s.close();
    fatal("The noise measurement doesn't have two separate finished runs. This is a bug; nothing was saved as a floor.");
  }

  const rows = (runId: string) => withDifficulty(store.loadTrials(runId), s.difficulties).map(outcomeRow);
  const noise = measureNoise(rows(runA), rows(runB));
  const floor: NoiseFloor = {
    configKey,
    measuredAt: new Date().toISOString(),
    runs: [runA, runB],
    datasetVersion: s.loaded.version,
    overall: noise.overall,
    byCategory: noise.byCategory,
  };
  appendNoiseFloor(floor);
  store.clearNoiseMeasurement(configKey);

  const o = noise.overall;
  console.log(`\n${styleText("bold", `Flip rate ${pct(o.flipRate)}: ${o.flips} of ${o.outcomes} tries came out differently the second time.`)}`);
  console.log(styleText("bold", `Changes smaller than ${points(o.floor, false)} points are noise.`));
  console.log(dim(`  From ${o.tasks} tasks × ${s.runConfig.triesPerTask} tries, twice. The floor is how far two identical runs land apart 95% of the time.`));
  for (const [category, c] of Object.entries(noise.byCategory)) {
    console.log(`  ${category.padEnd(9)} flip rate ${pct(c.flipRate).padStart(6)} (${c.flips}/${c.outcomes}) · noise floor ${points(c.floor, false).padStart(5)} points · ${c.tasks} tasks`);
  }
  console.log(dim(`  Saved as the noise floor for configuration ${configKey} in results/noise-floors.jsonl.`));
  await s.close();
}

void main();
