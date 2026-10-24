// `pnpm traffic [--candidate vN]`: one batch of simulated traffic. A simulated
// customer, given a persona and a dev task's customer side, chats with the
// promoted agent (or a candidate, never promoted by this) on a fresh copy of
// the shop. A seeded share of the batch is then graded by the graders that
// need no answer key and the claim checker, and the batch is written to
// results/online/<batch>/ for the online page. Flagged conversations go to
// the review queue.
import { relative } from "node:path";
import { styleText } from "node:util";
import { connectAgent, describeModelError, poolSecrets } from "../src/agent/model";
import { knobsLabel, loadAgentVersion, loadPolicy, type AgentKnobs } from "../src/agent/versions";
import { loadConfig, PROJECT_ROOT } from "../src/config";
import { dailyLimitReached, dayStart, estimateBudget } from "../src/eval/budget";
import { Pacer } from "../src/eval/pacer";
import { newRunId } from "../src/eval/plan";
import { makeRedactor } from "../src/eval/redact";
import type { PoolProvider } from "../src/eval/runner";
import { ask, compact, dim, fatal, makeClock, n } from "../src/eval/session";
import { EVAL_STORE_PATH, EvalStore } from "../src/eval/store";
import { langfuseSecrets } from "../src/eval/tracing";
import type { Trajectory } from "../src/eval/trajectory";
import { candidateKnobs, readCandidate } from "../src/gate/candidates";
import { readPromoted } from "../src/gate/promoted";
import { readShopFacts } from "../src/graders/shop-facts";
import { loadClaimsPrompt, type JudgeSetup } from "../src/judge/claims";
import { connectJudge, describeJudgeError, judgeSecrets } from "../src/judge/model";
import { callsToSend, runClaims } from "../src/judge/run-claims";
import { getShopToday, openFreshShop } from "../src/shop/db";
import { loadTasks } from "../src/tasks/load";
import { applyClaims, buildBatch, claimsJobs, gradeSample, toConversation } from "../src/online/batch";
import { runOnlineConversation } from "../src/online/conversation";
import { customerGoal, loadCustomerPrompt } from "../src/online/customer";
import { writeBatch } from "../src/online/files";
import { CallFailed, makePoolCaller, StopTraffic } from "../src/online/pool";
import { pickSample, planBatch, sampleSize } from "../src/online/sample";
import type { Batch, Conversation, OnlineRate } from "../src/online/schema";

const USAGE = "Usage: pnpm traffic [--candidate vN]";
const DAY_MS = 24 * 60 * 60 * 1000;
// Before there's history: agent calls per customer message (a lookup, then a reply).
const AGENT_CALLS_PER_TURN = 2;

function parseArgs(args: string[]): { candidate: string | null } {
  if (args.length === 0) return { candidate: null };
  if (args.length === 2 && args[0] === "--candidate") return { candidate: args[1] };
  fatal(USAGE);
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const rateText = (r: OnlineRate) =>
  r.estimate === null ? dim("— (nothing it could be told for)") : `${pct(r.estimate.value).padStart(4)} [${pct(r.estimate.lo)}–${pct(r.estimate.hi)}]  ${dim(`${r.hits} of ${r.of}`)}`;

async function main(): Promise<void> {
  const { candidate: candidateName } = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const { online, judge } = config;

  // The promoted version is promoted.json's newest entry; a candidate is it
  // with the candidate's one change. Nothing here writes either file.
  let knobs: AgentKnobs;
  let target: Batch["target"];
  try {
    const promoted = readPromoted();
    const current = promoted[promoted.length - 1];
    if (candidateName === null) {
      knobs = { promptVersion: current.promptVersion, toolDescriptionsVersion: current.toolDescriptionsVersion, validation: current.validation, exemplars: current.exemplars };
      target = { kind: "promoted", name: current.agentVersion };
    } else {
      knobs = candidateKnobs(readCandidate(candidateName), current);
      target = { kind: "candidate", name: candidateName };
    }
  } catch (error) {
    fatal(error instanceof Error ? error.message : String(error));
  }
  if (knobs.exemplars) fatal(`${target.name} uses exemplar memory, which \`pnpm traffic\` doesn't support. Nothing was run.`);

  const seed = openFreshShop();
  const today = getShopToday(seed.db);
  const shop = readShopFacts(seed.db, today);
  seed.dispose();

  // Dev tasks only: the loader hands out the holdout only to the gate.
  const loaded = loadTasks();
  const version = loadAgentVersion(knobs, today);
  const customerPrompt = loadCustomerPrompt(online.customerPromptVersion);
  const batchId = newRunId(new Date());
  const planned = planBatch(batchId, loaded.tasks, online.conversationsPerBatch);
  const toSample = sampleSize(planned.length, online.sampleShare);

  const pacers = new Map<string, Pacer>();
  const agents = config.agent.pool.map((member) => connectAgent(member, (remaining) => pacers.get(member.provider)?.observeRemaining(remaining)));
  const redact = makeRedactor([...poolSecrets(config), ...agents.flatMap((a) => a.secrets), ...judgeSecrets(judge), ...langfuseSecrets()]);
  const store = new EvalStore(EVAL_STORE_PATH, redact);

  try {
    // The estimate. The customer writes each canned reply and its opener, and
    // usually one more call to end; the agent answers each of those messages.
    const customerCalls = planned.reduce((sum, p) => sum + p.template.canned_replies.length + 2, 0);
    const callsPerTurn = (() => {
      const perTry = store.averageCallsPerTry();
      // A try has one turn per customer message: its first plus the canned replies.
      const turnsPerTry = loaded.tasks.reduce((sum, t) => sum + t.canned_replies.length + 1, 0) / loaded.tasks.length;
      return perTry === null ? AGENT_CALLS_PER_TURN : perTry / turnsPerTry;
    })();
    const agentCalls = Math.round(planned.reduce((sum, p) => sum + (p.template.canned_replies.length + 1) * callsPerTurn, 0));
    // The cap stops the batch, so it's the most it can send.
    const mostCalls = Math.min(online.maxCallsPerBatch, planned.length * online.maxTurns * (config.agent.maxSteps + 1));
    const providers = config.agent.pool.map((m) => m.provider);
    const usagePerCall = store.averageUsagePerCall(providers) ?? { inputTokens: 2000, cachedInputTokens: 0, outputTokens: 100 };
    const budget = estimateBudget({
      triesLeft: customerCalls + agentCalls,
      cachedTries: 0,
      callsPerTry: 1,
      usagePerCall,
      providers: config.agent.pool.map((m) => ({ provider: m.provider, limits: m.freeTierLimits, usedToday: store.usageSince(m.provider, dayStart(m.freeTierLimits.daily, Date.now())) })),
    });
    const judgeUsed = store.usageSince(judge.provider, Date.now() - DAY_MS).calls;
    const judgeLeft = Math.max(0, judge.freeTierLimits.requestsPerDay - judgeUsed);
    const labels = new Map<string, string>(agents.map((a) => [a.provider, a.label]));

    console.log(
      styleText(
        "bold",
        `VerifAI traffic · batch ${batchId} · ${target.kind} ${target.name} (${knobsLabel(knobs)}) · ${config.agent.model} · customer prompt ${customerPrompt.version} · dataset ${loaded.version}`,
      ),
    );
    console.log(
      dim(
        `  ${planned.length} conversations from ${loaded.tasks.length} dev tasks · up to ${online.maxTurns} customer messages each · ${toSample} graded (${pct(online.sampleShare)}) · holdout never used`,
      ),
    );
    if (target.kind === "candidate") console.log(dim(`  ${target.name} is only tried here: this never promotes it.`));
    console.log(`\nBudget ${dim("(rough: the customer and the agent share the agent's pool)")}`);
    console.log(
      `  Agent pool (${config.agent.model}): ~${n(customerCalls)} customer + ~${n(agentCalls)} agent calls ≈ ${n(budget.calls)} calls, ~${compact(budget.countedTokens)} tokens · at most ${n(mostCalls)} (the cap)`,
    );
    for (const p of budget.providers) {
      console.log(`    ${(labels.get(p.provider) ?? p.provider).padEnd(11)} left today ${compact(p.leftUnits)} of ${compact(p.allowance)} ${p.unit} · enough for ~${n(p.callsLeftToday)} calls`);
    }
    console.log(`  Judge (${judge.model}): ~${n(toSample)} claim-checker calls · ${judgeUsed} of ${judge.freeTierLimits.requestsPerDay} used today, ${judgeLeft} left`);
    if (!budget.fitsToday) console.log(styleText("yellow", "  Might not fit in today's free limits: the batch stops there and keeps what finished."));
    console.log("");

    if (!(await ask("Start? [y/N] "))) {
      console.log("Nothing was sent.");
      return;
    }

    const clock = makeClock();
    for (const m of config.agent.pool) pacers.set(m.provider, new Pacer(m.freeTierLimits, clock, store.recentCalls(m.provider, Date.now() - 60_000)));
    const outputPerCall = store.averageUsagePerCall(providers)?.outputTokens ?? 0;
    const pool: PoolProvider[] = agents.map((a, i) => {
      const member = config.agent.pool[i];
      const pacer = pacers.get(a.provider);
      if (!pacer) throw new Error(`No pacer for ${a.provider}.`);
      return {
        provider: a.provider,
        label: a.label,
        model: a.model,
        pacer,
        describeError: (error) => describeModelError(error, member, config.agent.stepTimeoutSeconds),
        dailyAfterLimitErrors: a.dailyAfterLimitErrors,
        dailyLimitReached: (pending) => {
          const { daily } = member.freeTierLimits;
          return dailyLimitReached(store.usageSince(a.provider, dayStart(daily, Date.now())), pending, outputPerCall, daily);
        },
      };
    });

    let interrupted = false;
    const onInterrupt = () => {
      if (interrupted) {
        console.log(styleText("red", "\nStopped at once. Nothing of this batch was saved."));
        process.exit(130);
      }
      interrupted = true;
      console.log(styleText("yellow", "\n  … Stopping after this call; the conversations already done are saved. Ctrl-C again to quit at once."));
      clock.wakeAll();
    };
    process.on("SIGINT", onInterrupt);

    const call = makePoolCaller({
      pool,
      clock,
      stopRequested: () => interrupted,
      maxCalls: online.maxCallsPerBatch,
      onNotice: (message) => console.log(styleText("yellow", `  … ${message}`)),
      record: ({ at, provider, usage }) =>
        store.recordProviderCall({ at, provider, model: config.agent.pool.find((m) => m.provider === provider)?.modelId ?? config.agent.model, ...usage }),
    });
    const prices = config.agent.pool.map((m) => ({ provider: m.provider, prices: m.pricePerMillionTokensUsd }));
    const createdAt = new Date().toISOString();
    const conversations: Conversation[] = [];
    const trajectories = new Map<number, Trajectory | null>();
    let stopped: string | null = null;

    try {
      for (const p of planned) {
        const startedAt = Date.now();
        let driven;
        try {
          driven = await runOnlineConversation(
            {
              agent: {
                model: pool[0].model,
                provider: pool[0].provider,
                temperature: config.agent.temperature,
                maxSteps: config.agent.maxSteps,
                stepTimeoutMs: config.agent.stepTimeoutSeconds * 1000,
                reasoningEffort: config.agent.reasoningEffort,
                version,
              },
              customer: {
                prompt: customerPrompt,
                maxTurns: online.maxTurns,
                temperature: online.customerTemperature,
                reasoningEffort: config.agent.reasoningEffort,
                stepTimeoutMs: config.agent.stepTimeoutSeconds * 1000,
              },
              call,
              // A provider's error arrives already in plain words.
              describeError: (error) => (error instanceof CallFailed || error instanceof Error ? error.message : String(error)),
            },
            { persona: p.persona, text: customerGoal(p.template) },
          );
        } catch (error) {
          if (!(error instanceof StopTraffic)) throw error;
          stopped = error.message;
          break;
        }
        const c = toConversation(p, driven, prices, { startedAt, finishedAt: Date.now() });
        conversations.push(c);
        trajectories.set(c.number, driven.trajectory);
        const how = c.status === "errored" ? styleText("red", `errored: ${c.error ?? ""}`) : `${c.end ?? ""} · ${c.turns} messages · ${c.calls} agent calls`;
        console.log(`  ${String(c.number).padStart(String(planned.length).length)}/${planned.length}  ${c.templateId.padEnd(18)} ${c.persona.padEnd(12)} ${how}`);
      }
    } finally {
      process.off("SIGINT", onInterrupt);
    }

    if (conversations.length === 0) {
      console.log(styleText(["yellow", "bold"], `\n■ Stopped before any conversation finished: ${stopped ?? "no reason given"}. Nothing was written.`));
      return;
    }

    // The sample is drawn from what ran, so a batch stopped short still grades its share.
    const sample = pickSample(batchId, conversations.map((c) => c.number), online.sampleShare);
    let graded = gradeSample(conversations, sample, trajectories, shop, version.policy);

    const setup: JudgeSetup = {
      model: judge.model,
      temperature: judge.temperature,
      thinkingLevel: judge.thinkingLevel,
      promptVersion: judge.claimsPromptVersion,
      prompt: loadClaimsPrompt(judge.claimsPromptVersion),
    };
    const jobs = claimsJobs(graded, setup, { policy: loadPolicy(), today }, (key) => store.cacheGet(key));
    const plan = { jobs, noReplies: jobs.filter((j) => j.input === null).length, errored: 0 };
    if (interrupted) {
      console.log(dim("  Claims not checked: stopped by Ctrl-C. The hallucination rate counts only what the code graders found."));
    } else if (jobs.length > 0) {
      const toSend = callsToSend(plan);
      console.log(dim(`\n  Checking claims in ${jobs.length} graded conversations (${toSend} judge calls)…`));
      const outcome = await runClaims({
        store,
        plan,
        judge,
        setup,
        model: toSend > 0 ? connectJudge(judge).model : null,
        clock,
        sentToday: judgeUsed,
        describeError: (error) => describeJudgeError(error, judge),
        stopRequested: () => interrupted,
        onNotice: (message) => console.log(styleText("yellow", `  … ${message}`)),
        onProgress: () => {},
      });
      graded = applyClaims(graded, outcome.checks);
      if (outcome.stop) console.log(styleText("yellow", `  Claim checker stopped: ${outcome.stop.message}. Those conversations count as not checked.`));
    }

    const batch = buildBatch(
      {
        batchId,
        createdAt,
        finishedAt: new Date().toISOString(),
        datasetVersion: loaded.version,
        target,
        agent: {
          label: version.label,
          model: config.agent.model,
          pool: providers,
          temperature: config.agent.temperature,
          maxSteps: config.agent.maxSteps,
          reasoningEffort: config.agent.reasoningEffort,
        },
        customer: { promptVersion: customerPrompt.version, temperature: online.customerTemperature, maxTurns: online.maxTurns },
        judge: { model: judge.model, claimsPromptVersion: judge.claimsPromptVersion },
        sampleShare: online.sampleShare,
        hallucinationThreshold: online.hallucinationThreshold,
        stopped,
      },
      graded,
    );
    const dir = writeBatch(batch, graded, redact);

    const r = batch.rates;
    if (stopped) console.log(styleText(["yellow", "bold"], `\n■ Stopped after ${r.conversations} of ${planned.length} conversations: ${stopped}`));
    console.log(
      `\n  ${r.conversations} conversations · ${r.errored} errored · ${r.graded} graded` +
        (r.claimsMissing > 0 ? ` · ${r.claimsMissing} without a claim check` : "") +
        (r.ungraded > 0 ? ` · ${r.ungraded} with a check that couldn't run` : ""),
    );
    console.log(dim("  rates over graded conversations, 95% bootstrap interval (resampling conversations, 10,000 times)"));
    console.log(`  hallucination   ${rateText(r.rates.hallucination)}`);
    console.log(`  policy broken   ${rateText(r.rates.policy)}`);
    console.log(`  tool errors     ${rateText(r.rates.toolErrors)}`);
    console.log(`  loops           ${rateText(r.rates.loops)}`);
    console.log(`  flagged         ${rateText(r.rates.flagged)}`);
    const flagged = graded.filter((c) => c.flags.length > 0).length;
    if (flagged > 0) console.log(`  ${flagged} flagged conversations added to the review queue (/review, marked online).`);
    if (batch.alert && r.rates.hallucination.estimate) {
      const e = r.rates.hallucination.estimate;
      console.log(
        styleText(
          ["red", "bold"],
          `\n⚠ ALERT: hallucination ${pct(e.value)} [${pct(e.lo)}–${pct(e.hi)}] in ${r.rates.hallucination.of} graded conversations is over the ${pct(online.hallucinationThreshold)} threshold.`,
        ),
      );
    }
    console.log(dim(`\n  Results: ${relative(PROJECT_ROOT, dir)}/ · open /online with \`pnpm dev\``));
  } catch (error) {
    fatal(error instanceof Error ? error.message : String(error));
  } finally {
    store.close();
  }
}

void main();
