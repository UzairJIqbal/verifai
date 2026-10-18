// `pnpm judge:bias <order|padding>`: a bias check on the rubric judge in the
// config. Each labelled trial it already judged is shown to it again, changed
// in one way that shouldn't matter, and the verdicts that moved are counted.
// Order: every labelled trial, the conversation before the policy and the
// criteria reversed. Padding: only trials you labelled as passing everything,
// with harmless closing sentences on the last reply. One judge call per
// trial; answers are cached, so a second run sends none. Only a finished check
// is saved, to evals/labels/bias.jsonl.
import { styleText } from "node:util";
import { z } from "zod";
import { poolSecrets } from "../src/agent/model";
import { loadPolicy } from "../src/agent/versions";
import { loadConfig } from "../src/config";
import { makeRedactor } from "../src/eval/redact";
import { dim, fatal, makeClock, n } from "../src/eval/session";
import { EVAL_STORE_PATH, EvalStore } from "../src/eval/store";
import { langfuseSecrets } from "../src/eval/tracing";
import type { JudgeSetup } from "../src/judge/claims";
import { connectJudge, describeJudgeError, judgeSecrets } from "../src/judge/model";
import { judgeAnswerSchema, judgeCacheKey, judgeRequest, loadRubric, readJudgeAnswer, type JudgeRequest } from "../src/judge/rubric";
import { callsToSend, runJudgeCalls, type CallsProgress, type JudgeJob } from "../src/judge/run-calls";
import { orderSwappedRequest, paddedSteps, paddingEligible, tallyBias, type BiasPair } from "../src/labels/bias";
import { appendBiasResult, readLabels } from "../src/labels/files";
import { BIAS_CHECKS, type BiasCheck } from "../src/labels/schema";
import { readRun, type RunFiles } from "../src/results/read";
import type { JudgeCheck } from "../src/results/schema";
import { getShopToday, openFreshShop } from "../src/shop/db";

const USAGE = `Usage: pnpm judge:bias <${BIAS_CHECKS.join("|")}>`;
const DAY_MS = 24 * 60 * 60 * 1000;

type BiasJob = JudgeJob & { input: string; request: JudgeRequest; pair: Omit<BiasPair, "after"> };

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const parsed = z.enum(BIAS_CHECKS).safeParse(args[0]);
  if (args.length !== 1 || !parsed.success) fatal(USAGE);
  const check: BiasCheck = parsed.data;

  const config = loadConfig();
  const judge = config.judge;
  const redact = makeRedactor([...poolSecrets(config), ...judgeSecrets(judge), ...langfuseSecrets()]);
  const store = new EvalStore(EVAL_STORE_PATH, redact);
  try {
    const rubric = loadRubric(judge.rubricVersion);
    const setup: JudgeSetup = { model: judge.model, temperature: judge.temperature, thinkingLevel: judge.thinkingLevel, promptVersion: rubric.version, prompt: rubric.text };
    const judgeName = `${judge.model} · rubric ${rubric.version}`;
    const seed = openFreshShop();
    const background = { policy: loadPolicy(), today: getShopToday(seed.db) };
    seed.dispose();

    const labels = readLabels();
    if (labels.length === 0) fatal("No labels yet. Start `pnpm dev` and open /labelling to label trials first.");
    const chosen = check === "padding" ? labels.filter(paddingEligible) : labels;
    if (chosen.length === 0) fatal("No trial is labelled as passing every criterion, so there are no good replies to pad. Label more trials first.");

    // The baseline is the verdict already in the results files, from this
    // judge and rubric: the trial as the judge normally sees it.
    const runs = new Map<string, RunFiles | null>();
    let notJudged = 0;
    const jobs: BiasJob[] = [];
    for (const l of chosen) {
      if (!runs.has(l.runId)) runs.set(l.runId, readRun(l.runId));
      const run = runs.get(l.runId);
      const trial = run?.split === "dev" ? run.trials.find((t) => t.taskId === l.taskId && t.tryNumber === l.tryNumber) : undefined;
      const before = trial?.judge;
      if (!trial || before?.status !== "judged" || before.rubricVersion !== rubric.version || before.model !== judge.model) {
        notJudged++;
        continue;
      }
      const criteria = before.verdicts.map((v) => v.criterion);
      const request = check === "order" ? orderSwappedRequest(trial.steps, background, criteria) : judgeRequest(paddedSteps(trial.steps), background, criteria);
      const key = judgeCacheKey(setup, request);
      jobs.push({ taskId: l.taskId, tryNumber: l.tryNumber, input: request.input, request, key, cached: store.cacheGet(key), pair: { runId: l.runId, taskId: l.taskId, tryNumber: l.tryNumber, split: l.split, before } });
    }
    if (jobs.length === 0) fatal(`None of the ${chosen.length} labelled trials has a verdict from ${judgeName}. Run \`pnpm judge <run>\` on the labelled runs first.`);

    const toSend = callsToSend(jobs);
    const usedToday = store.usageSince(judge.provider, Date.now() - DAY_MS).calls;
    const leftToday = Math.max(0, judge.freeTierLimits.requestsPerDay - usedToday);
    console.log(styleText("bold", `VerifAI bias check · ${check} · judge ${judgeName}`));
    console.log(dim(`  ${jobs.length} trials` + (notJudged > 0 ? ` (${notJudged} labelled trials left out: not judged with this rubric)` : "") + ` · ${jobs.length - toSend} already in the cache`));
    console.log(`  Judge: ~${n(toSend)} calls to send · ${usedToday} of ${judge.freeTierLimits.requestsPerDay} used today, ${leftToday} left · ~${Math.ceil(toSend / judge.freeTierLimits.requestsPerMinute)} minutes\n`);

    const model = toSend > 0 ? connectJudge(judge).model : null;
    const clock = makeClock();
    let interrupted = false;
    const onInterrupt = () => {
      if (interrupted) process.exit(130);
      interrupted = true;
      console.log(styleText("yellow", "\n  … Stopping after this call. Ctrl-C again to quit at once."));
      clock.wakeAll();
    };
    process.on("SIGINT", onInterrupt);
    const live = process.stdout.isTTY;
    const progressText = (p: CallsProgress) => `  trials ${p.done}/${p.total} · ${p.sent} calls sent · ${p.replayed} from the cache · ${p.ungraded} couldn't grade`;
    let outcome;
    try {
      outcome = await runJudgeCalls<BiasJob, { job: BiasJob; check: JudgeCheck }>({
        store,
        jobs,
        judge,
        setup,
        schema: judgeAnswerSchema,
        model,
        clock,
        sentToday: usedToday,
        read: (text, job) => ({ job, check: readJudgeAnswer(text, job.request, setup) }),
        isUngraded: (r) => r.check.status === "ungraded",
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

    // A half-finished check would count only the trials it reached: nothing
    // is saved, and the next run replays what's cached.
    if (outcome.stop) fatal(`Stopped: ${outcome.stop.message}\n  Nothing saved. Run \`pnpm judge:bias ${check}\` again to carry on; answers so far are cached.`);
    if (outcome.results.length < jobs.length) {
      fatal(`${jobs.length - outcome.results.length} judge calls failed, so the check is incomplete and wasn't saved. Run \`pnpm judge:bias ${check}\` again; answers so far are cached.`);
    }

    const result = tallyBias(check, judgeName, new Date().toISOString(), outcome.results.map(({ result }) => ({ ...result.job.pair, after: result.check })));
    appendBiasResult(result);
    console.log(styleText("bold", `\n  ${result.changed} of ${result.verdicts} verdicts changed`) + dim(` · ${result.trials} trials, ${result.tasks} tasks`));
    for (const c of result.byCriterion) console.log(`    ${c.criterion.padEnd(18)} ${c.changed} of ${c.verdicts} · pass → fail ${c.passToFail} · fail → pass ${c.failToPass}`);
    if (result.ungraded > 0) console.log(styleText("yellow", `  ${result.ungraded} trials couldn't be read after the change; left out, not counted as unchanged.`));
    for (const c of result.changes) console.log(dim(`    judge-dev ${c.runId}/${c.taskId}/${c.tryNumber} ${c.criterion}: ${c.before ? "pass" : "fail"} → ${c.after ? "pass" : "fail"}`));
    console.log(dim("\n  Saved to evals/labels/bias.jsonl. `pnpm agreement` puts it in docs/judge-validation.md."));
  } catch (error) {
    fatal(error instanceof Error ? error.message : String(error));
  } finally {
    store.close();
  }
}

void main();
