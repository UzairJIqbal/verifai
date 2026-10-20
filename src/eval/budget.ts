import type { FreeTierLimits } from "../config";
import { countedTokens, type CallUsage } from "./pacer";
import type { ProviderUsage } from "./store";

// How much of a provider's daily allowance some tokens use, in its own unit
// (tokens for Groq, neurons for Cloudflare).
export function dailyUnits(usage: CallUsage, daily: FreeTierLimits["daily"]): number {
  const w = daily.unitsPerMillionTokens;
  const fresh = usage.inputTokens - usage.cachedInputTokens;
  return (fresh * w.input + usage.cachedInputTokens * w.cachedInput + usage.outputTokens * w.output) / 1_000_000;
}

// Where today's count starts, for a provider whose day resets as `daily` says.
export function dayStart(daily: FreeTierLimits["daily"], nowMs: number): number {
  if (daily.resets === "rolling 24 hours") return nowMs - 24 * 60 * 60 * 1000;
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Why a call of about `guessTokens` mustn't be sent, or null if it may be. Our
 * own count is the limit, not the provider's refusal: Cloudflare kept answering
 * at 2.6 times its free allowance and never said it was used up.
 */
export function dailyLimitReached(usedToday: ProviderUsage, guessTokens: number, daily: FreeTierLimits["daily"]): string | null {
  const used = dailyUnits(usedToday, daily);
  const next = dailyUnits({ inputTokens: guessTokens, cachedInputTokens: 0, outputTokens: 0 }, daily);
  if (used + next <= daily.allowance) return null;
  return `${Math.round(used).toLocaleString("en-US")} of its ${daily.allowance.toLocaleString("en-US")} ${daily.unit} today are used by our count`;
}

export type ProviderBudgetInput ={ provider: string; limits: FreeTierLimits; usedToday: ProviderUsage };

export type BudgetInput = {
  triesLeft: number;
  // Tries whose first call is already in the cache: replayed, not sent.
  cachedTries: number;
  callsPerTry: number;
  // An average call's tokens, from past runs.
  usagePerCall: CallUsage;
  // In pool order.
  providers: ProviderBudgetInput[];
};

export type ProviderBudget = {
  provider: string;
  unit: string;
  allowance: number;
  leftUnits: number;
  // Calls the rest of today's allowance pays for, and a whole day's.
  callsLeftToday: number;
  callsPerDay: number;
};

export type Budget = {
  triesToSend: number;
  calls: number;
  countedTokens: number;
  providers: ProviderBudget[];
  fitsToday: boolean;
  // Days until it's done, counting today, if every provider's whole allowance is used each day.
  days: number;
};

function providerBudget(p: ProviderBudgetInput, usagePerCall: CallUsage): ProviderBudget {
  const { daily, requestsPerDay } = p.limits;
  const unitsPerCall = Math.max(dailyUnits(usagePerCall, daily), Number.EPSILON);
  const leftUnits = Math.max(0, daily.allowance - dailyUnits(p.usedToday, daily));
  const leftRequests = requestsPerDay === null ? Infinity : Math.max(0, requestsPerDay - p.usedToday.calls);
  return {
    provider: p.provider,
    unit: daily.unit,
    allowance: daily.allowance,
    leftUnits,
    callsLeftToday: Math.min(Math.floor(leftUnits / unitsPerCall), leftRequests),
    callsPerDay: Math.min(Math.floor(daily.allowance / unitsPerCall), requestsPerDay ?? Infinity),
  };
}

export function estimateBudget(input: BudgetInput): Budget {
  const triesToSend = Math.max(0, input.triesLeft - input.cachedTries);
  const calls = Math.round(triesToSend * input.callsPerTry);
  const providers = input.providers.map((p) => providerBudget(p, input.usagePerCall));
  const today = providers.reduce((sum, p) => sum + p.callsLeftToday, 0);
  const perDay = Math.max(1, providers.reduce((sum, p) => sum + p.callsPerDay, 0));
  return {
    triesToSend,
    calls,
    countedTokens: Math.round(calls * countedTokens(input.usagePerCall)),
    providers,
    fitsToday: calls <= today,
    days: calls <= today ? 1 : 1 + Math.ceil((calls - today) / perDay),
  };
}
