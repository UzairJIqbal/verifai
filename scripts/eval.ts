// `pnpm eval`: every dev task once, one after another, each on a fresh copy of
// the shop. Prints pass or fail per task and the success rate. The holdout is
// never loaded here.
import { setTimeout as sleep } from "node:timers/promises";
import { styleText } from "node:util";
import { loadConfig, requireApiKey } from "../src/config";
import { getShopToday, openFreshShop } from "../src/shop/db";
import { loadAgentVersion } from "../src/agent/versions";
import { agentProvider, createAgentModel, describeModelError, isRateLimited } from "../src/agent/model";
import type { AgentSetup } from "../src/agent/loop";
import { runTaskConversation } from "../src/eval/conversation";
import { gradeState } from "../src/graders/state";
import { gradeReply } from "../src/graders/reply";
import { loadTasks } from "../src/tasks/load";
import type { Task } from "../src/tasks/schema";
import type { Verdict } from "../src/eval/trajectory";

const dim = (text: string) => styleText("dim", text);

// Groq's free tier answers a burst with 429 and frees up within a minute.
const RATE_LIMIT_WAIT_SECONDS = 60;
const RATE_LIMIT_RETRIES = 2;
// Three failures in a row means something is wrong with the key, the model or
// the day's limit, not with the tasks. Stop rather than spend the rest.
const STOP_AFTER_ERRORS_IN_A_ROW = 3;

type Outcome = { kind: "graded"; verdicts: Verdict[]; end: string } | { kind: "error"; message: string };

function fatal(message: string): never {
  console.error(styleText("red", `✗ ${message}`));
  process.exit(1);
}

async function runTask(setup: AgentSetup, task: Task, describe: (error: unknown) => string): Promise<Outcome> {
  for (let attempt = 0; ; attempt++) {
    try {
      // Each attempt starts over on a fresh shop, so a half-finished try leaves nothing behind.
      const trajectory = await runTaskConversation(setup, task);
      return { kind: "graded", verdicts: [gradeState(task, trajectory), gradeReply(task, trajectory)], end: trajectory.end };
    } catch (error) {
      if (!isRateLimited(error) || attempt >= RATE_LIMIT_RETRIES) return { kind: "error", message: describe(error) };
      console.log(dim(`  … ${task.id}: rate limited, waiting ${RATE_LIMIT_WAIT_SECONDS}s then starting it again (retry ${attempt + 1} of ${RATE_LIMIT_RETRIES})`));
      await sleep(RATE_LIMIT_WAIT_SECONDS * 1000);
    }
  }
}

async function main(): Promise<void> {
  let setup: AgentSetup;
  let loaded: ReturnType<typeof loadTasks>;
  let label: string;
  let describe: (error: unknown) => string;
  try {
    loaded = loadTasks();
    const config = loadConfig();
    const provider = agentProvider(config);
    const shop = openFreshShop();
    const today = getShopToday(shop.db);
    shop.dispose();
    setup = {
      model: createAgentModel(config, requireApiKey(provider)),
      temperature: config.agent.temperature,
      maxSteps: config.agent.maxSteps,
      stepTimeoutMs: config.agent.stepTimeoutSeconds * 1000,
      version: loadAgentVersion(config, today),
    };
    label = `agent ${setup.version.label} · ${provider.label} ${config.agent.model} · temperature ${config.agent.temperature}`;
    describe = (error) => describeModelError(error, config);
  } catch (error) {
    fatal(error instanceof Error ? error.message : String(error));
  }

  const { tasks, version, holdoutCounts } = loaded;
  if (tasks.length === 0) fatal("There are no dev tasks in evals/tasks.jsonl.");
  const holdout = Object.values(holdoutCounts).reduce((a, b) => a + b, 0);
  console.log(styleText("bold", `VerifAI eval · dataset ${version} · ${tasks.length} dev tasks · 1 try each`));
  console.log(dim(`  ${label}`));
  console.log(dim(`  ${holdout} holdout tasks are not loaded or run.\n`));

  const width = Math.max(...tasks.map((t) => t.id.length));
  let passed = 0;
  let errored = 0;
  let errorsInARow = 0;
  let run = 0;
  for (const task of tasks) {
    const outcome = await runTask(setup, task, describe);
    run++;
    const id = task.id.padEnd(width);
    if (outcome.kind === "error") {
      errored++;
      errorsInARow++;
      console.log(`${styleText(["yellow", "bold"], "ERROR")} ${id}  ${styleText("yellow", outcome.message)}`);
      if (errorsInARow >= STOP_AFTER_ERRORS_IN_A_ROW) {
        console.log(styleText("red", `\n✗ Stopped after ${errorsInARow} errors in a row; ${tasks.length - run} tasks were not run. Fix the error above and run again.`));
        break;
      }
      continue;
    }
    errorsInARow = 0;
    const pass = outcome.verdicts.every((v) => v.pass);
    if (pass) passed++;
    const reasons = outcome.verdicts.map((v) => `${v.grader}: ${v.reason}`).join(" · ");
    const end = outcome.end === "answered" ? "" : ` · ended: ${outcome.end}`;
    console.log(`${pass ? styleText("green", "PASS ") : styleText("red", "FAIL ")} ${id}  ${dim(reasons + end)}`);
  }

  // Every task that was meant to run counts in the denominator, errors and
  // unrun tasks included: an error is not a pass.
  const rate = ((passed / tasks.length) * 100).toFixed(1);
  console.log(`\n${styleText("bold", `Success rate: ${passed}/${tasks.length} = ${rate}%`)}`);
  console.log(dim(`  ${tasks.length} dev tasks, 1 try each. No error bar: one try per task can't give one, so read this as rough.`));
  const notRun = tasks.length - run;
  if (errored > 0 || notRun > 0) {
    console.log(
      styleText(
        ["yellow", "bold"],
        `⚠ ${errored} task(s) errored${notRun > 0 ? ` and ${notRun} never ran` : ""}. They count as not passed, so this rate understates the agent.`,
      ),
    );
    process.exitCode = 1;
  }
}

void main();
