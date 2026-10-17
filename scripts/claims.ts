// `pnpm claims [runId]`: the claim checker. The judge model reads each try of
// a finished dev run and labels every claim in the agent's replies, then the
// run's results are rewritten with the claim rates. About one judge call per
// try; answers are cached, so a second run over the same tries sends none,
// and a run stopped at the daily limit carries on where it stopped.
// With no run id, the newest finished dev run that isn't a smoke run.
import { relative } from "node:path";
import { styleText } from "node:util";
import { poolSecrets } from "../src/agent/model";
import { loadPolicy } from "../src/agent/versions";
import { loadConfig, PROJECT_ROOT } from "../src/config";
import { pickFinishedRun } from "../src/eval/finished-run";
import { makeRedactor } from "../src/eval/redact";
import { dim, fatal, makeClock, n, printHallucinationReport } from "../src/eval/session";
import { EVAL_STORE_PATH, EvalStore } from "../src/eval/store";
import { langfuseSecrets } from "../src/eval/tracing";
import { loadClaimsPrompt, type JudgeSetup } from "../src/judge/claims";
import { connectJudge, describeJudgeError, judgeSecrets } from "../src/judge/model";
import { callsToSend, planClaims, runClaims, type ClaimsProgress } from "../src/judge/run-claims";
import { writeResults } from "../src/results/write";
import { getShopToday, openFreshShop } from "../src/shop/db";

const USAGE = "Usage: pnpm claims [runId]   (run ids are the folder names under results/)";
const DAY_MS = 24 * 60 * 60 * 1000;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length > 1) fatal(USAGE);

  const config = loadConfig();
  const judge = config.judge;
  const redact = makeRedactor([...poolSecrets(config), ...judgeSecrets(judge), ...langfuseSecrets()]);
  const store = new EvalStore(EVAL_STORE_PATH, redact);
  try {
    const { run, tasksById } = pickFinishedRun(store, args[0], "check", "checked");
    const setup: JudgeSetup = {
      model: judge.model,
      temperature: judge.temperature,
      thinkingLevel: judge.thinkingLevel,
      promptVersion: judge.claimsPromptVersion,
      prompt: loadClaimsPrompt(judge.claimsPromptVersion),
    };
    const seed = openFreshShop();
    const today = getShopToday(seed.db);
    seed.dispose();

    const trials = store.loadTrials(run.id);
    const plan = planClaims(store, setup, trials, { policy: loadPolicy(), today });
    const toSend = callsToSend(plan);
    const usedToday = store.usageSince(judge.provider, Date.now() - DAY_MS).calls;
    const leftToday = Math.max(0, judge.freeTierLimits.requestsPerDay - usedToday);

    console.log(styleText("bold", `VerifAI claims · run ${run.id} · dataset ${run.config.datasetVersion} · judge ${judge.model} · prompt claims ${setup.promptVersion}`));
    console.log(
      dim(
        `  ${plan.jobs.length} tries to read` +
          (plan.errored > 0 ? ` (${plan.errored} errored tries left out)` : "") +
          ` · ${plan.noReplies} have no reply (no call) · ${plan.jobs.length - plan.noReplies - toSend} already in the cache`,
      ),
    );
    console.log(`\nBudget ${dim("(\"today\" is the last 24 hours, by our own count)")}`);
    console.log(
      `  Judge: ~${n(toSend)} calls to send · ${usedToday} of ${judge.freeTierLimits.requestsPerDay} used today, ${leftToday} left · ${judge.freeTierLimits.requestsPerMinute} a minute, so ~${Math.ceil(toSend / judge.freeTierLimits.requestsPerMinute)} minutes`,
    );
    if (/NOT CHECKED/.test(judge.freeTierLimits.checked)) console.log(styleText("yellow", `  The judge's limits are assumed, not checked: ${judge.freeTierLimits.checked}`));
    if (toSend > leftToday) {
      console.log(styleText("yellow", `  Won't finish today: it stops at the daily limit and \`pnpm claims ${run.id}\` carries on.`));
    }
    console.log("");

    // The key is only needed when there's something to send.
    const model = toSend > 0 ? connectJudge(judge).model : null;

    const clock = makeClock();
    let interrupted = false;
    const onInterrupt = () => {
      if (interrupted) {
        console.log(styleText("red", "\nStopped at once. Nothing from this run of `pnpm claims` was saved, but every answer is cached, so the next one sends none of them again."));
        process.exit(130);
      }
      interrupted = true;
      console.log(styleText("yellow", "\n  … Stopping after this call; what's checked so far is saved. Ctrl-C again to quit at once."));
      clock.wakeAll();
    };
    process.on("SIGINT", onInterrupt);

    const live = process.stdout.isTTY;
    const progressText = (p: ClaimsProgress) => `  tries ${p.done}/${p.total} · ${p.sent} calls sent · ${p.replayed} from the cache · ${p.ungraded} couldn't grade`;
    let outcome;
    try {
      outcome = await runClaims({
        store,
        plan,
        judge,
        setup,
        model,
        clock,
        sentToday: usedToday,
        describeError: (error) => describeJudgeError(error, judge),
        stopRequested: () => interrupted,
        onNotice: (message) => console.log(styleText("yellow", `${live ? "\n" : ""}  … ${message}`)),
        onProgress: (p) => {
          if (live) {
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            process.stdout.write(progressText(p));
          } else if (p.done === p.total || p.done % 10 === 0) console.log(progressText(p));
        },
      });
    } finally {
      process.off("SIGINT", onInterrupt);
      if (live) process.stdout.write("\n");
    }

    store.saveClaims(run.id, outcome.checks);
    const written = writeResults(run, store.loadTrials(run.id), tasksById, run.finishedAt, redact);
    if (outcome.stop) {
      console.log(styleText(["yellow", "bold"], `\n■ Stopped: ${outcome.stop.message}`));
      console.log(`  ${outcome.checks.length} of ${plan.jobs.length} tries checked and saved. Run \`pnpm claims ${run.id}\` again to carry on; nothing is asked twice.`);
    } else {
      console.log(`\n  ${outcome.checks.length} tries checked · ${outcome.sent} judge calls sent.`);
    }
    printHallucinationReport(written.report);
    console.log(dim(`\n  Results: ${relative(PROJECT_ROOT, written.dir)}/ · open the run page with \`pnpm dev\``));
  } catch (error) {
    fatal(error instanceof Error ? error.message : String(error));
  } finally {
    store.close();
  }
}

void main();
