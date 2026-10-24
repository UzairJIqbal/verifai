// Turning driven conversations into a batch's record: steps and cost, the
// sample's grades and claim checks, the flags, and the batch's rates.
import type { ModelUsage } from "../agent/loop";
import { costUsd } from "../eval/runner";
import type { RunPrices } from "../eval/store";
import type { TrajectoryEvent } from "../eval/trajectory";
import type { ShopFacts } from "../graders/steps";
import { claimsCacheKey, claimsRequest, type JudgeSetup } from "../judge/claims";
import type { ClaimsJob } from "../judge/run-claims";
import type { Background } from "../graders/hallucination";
import { stepSchema, type ClaimCheck, type Step } from "../results/schema";
import type { DrivenConversation } from "./conversation";
import { flagReasons, gradeOnline } from "./grade";
import type { PlannedConversation } from "./sample";
import type { Batch, Conversation } from "./schema";
import { batchRates, isAlert } from "./stats";

export type PoolPrices = { provider: string; prices: RunPrices }[];

// A call is priced at the provider that answered it.
const pricesFor = (provider: string, pool: PoolPrices): RunPrices => (pool.find((m) => m.provider === provider) ?? pool[0]).prices;

const toStep = (event: TrajectoryEvent, pool: PoolPrices): Step =>
  // Parsed rather than cast, as in the runner: a tool input that isn't plain JSON fails loudly here.
  stepSchema.parse(event.type === "model" ? { ...event, costUsd: costUsd(event.usage, pricesFor(event.provider, pool)) } : event);

const sumUsage = (usages: ModelUsage[]): ModelUsage => ({
  inputTokens: usages.reduce((a, u) => a + u.inputTokens, 0),
  cachedInputTokens: usages.reduce((a, u) => a + u.cachedInputTokens, 0),
  outputTokens: usages.reduce((a, u) => a + u.outputTokens, 0),
});

// Not yet sampled or graded: that's decided once the batch's conversations are in.
export function toConversation(planned: PlannedConversation, driven: DrivenConversation, pool: PoolPrices, times: { startedAt: number; finishedAt: number }): Conversation {
  const steps = driven.events.map((e) => toStep(e, pool));
  const models = steps.filter((s): s is Extract<Step, { type: "model" }> => s.type === "model");
  const customerCost = driven.customerCalls.reduce((sum, c) => sum + costUsd(c.usage, pricesFor(c.provider, pool)), 0);
  return {
    number: planned.number,
    templateId: planned.template.id,
    category: planned.template.category,
    difficulty: planned.template.difficulty,
    persona: planned.persona,
    status: driven.status,
    end: driven.end,
    endReason: driven.endReason,
    error: driven.error,
    turns: driven.turns,
    sampled: false,
    verdicts: [],
    claims: null,
    flags: [],
    calls: models.length,
    usage: sumUsage(models.map((s) => s.usage)),
    customerCalls: driven.customerCalls.length,
    customerUsage: sumUsage(driven.customerCalls.map((c) => c.usage)),
    costUsd: models.reduce((sum, s) => sum + s.costUsd, 0) + customerCost,
    startedAt: new Date(times.startedAt).toISOString(),
    finishedAt: new Date(times.finishedAt).toISOString(),
    steps,
  };
}

// The sample's grades, from the trajectories the driver returned (with the
// shop's changes, which the saved steps don't carry). An errored
// conversation is sampled but has nothing to grade.
export function gradeSample(conversations: Conversation[], sample: Set<number>, trajectories: Map<number, DrivenConversation["trajectory"]>, shop: ShopFacts, policy: string): Conversation[] {
  return conversations.map((c) => {
    if (!sample.has(c.number)) return c;
    const trajectory = trajectories.get(c.number) ?? null;
    if (c.status === "errored" || trajectory === null) return { ...c, sampled: true };
    const verdicts = gradeOnline(trajectory, shop, policy);
    return { ...c, sampled: true, verdicts, flags: flagReasons(verdicts, null) };
  });
}

// One claim-checker job per graded conversation, keyed by its number.
export function claimsJobs(conversations: Conversation[], setup: JudgeSetup, background: Background, cacheGet: (key: string) => string | null): ClaimsJob[] {
  return conversations
    .filter((c) => c.sampled && c.status === "finished")
    .map((c) => {
      const request = claimsRequest(c.steps, background);
      const key = claimsCacheKey(setup, request);
      return { taskId: c.templateId, tryNumber: c.number, request, input: request.replySteps.length > 0 ? request.input : null, key, cached: cacheGet(key) };
    });
}

export function applyClaims(conversations: Conversation[], checks: { tryNumber: number; claims: ClaimCheck }[]): Conversation[] {
  const byNumber = new Map(checks.map((c) => [c.tryNumber, c.claims]));
  return conversations.map((c) => {
    const claims = byNumber.get(c.number);
    return claims === undefined ? c : { ...c, claims, flags: flagReasons(c.verdicts, claims) };
  });
}

export function buildBatch(meta: Omit<Batch, "rates" | "alert">, conversations: Conversation[]): Batch {
  const rates = batchRates(conversations);
  return { ...meta, rates, alert: isAlert(rates, meta.hallucinationThreshold) };
}
