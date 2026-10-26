import { createGroq } from "@ai-sdk/groq";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { APICallError, RetryError, wrapLanguageModel, type LanguageModel } from "ai";
import { z } from "zod";
import { readOptionalEnv, requireApiKey, type AgentProvider, type ApiKeySource, type Config, type PoolMember } from "../config";

type ProviderInfo = {
  label: string;
  // Settings it needs from .env.local, each checked before any call.
  env: ApiKeySource[];
  create: (env: Record<string, string>, modelId: string) => Exclude<LanguageModel, string>;
  // The reply header with the provider's count of tokens left this minute, if it sends one.
  remainingTokensHeader: string | null;
  // After this many limit errors in a row, whatever they say, the eval treats
  // today's free limit as used up. Null when the provider's wording is known.
  dailyAfterLimitErrors: number | null;
};

// Cloudflare refuses an assistant message whose content is null (a turn that
// was only tool calls) with a 400; it wants an empty string. Nothing else in
// the request is touched.
const chatBody = z.looseObject({ messages: z.array(z.looseObject({ role: z.string(), content: z.unknown() })) });
function emptyAssistantContent(body: Record<string, unknown>): Record<string, unknown> {
  const parsed = chatBody.safeParse(body);
  if (!parsed.success) return body;
  return { ...parsed.data, messages: parsed.data.messages.map((m) => (m.role === "assistant" && m.content === null ? { ...m, content: "" } : m)) };
}

// Everything provider-specific in one place; the pool is picked in the config.
const PROVIDERS = {
  groq: {
    label: "Groq",
    env: [{ env: "GROQ_API_KEY", getKeyAt: "https://console.groq.com/keys" }],
    create: (env, modelId) => createGroq({ apiKey: env.GROQ_API_KEY })(modelId),
    remainingTokensHeader: "x-ratelimit-remaining-tokens",
    // Groq names the daily limit in its error, so a per-minute 429 never
    // counts towards it.
    dailyAfterLimitErrors: null,
  },
  cloudflare: {
    label: "Cloudflare",
    env: [
      { env: "CLOUDFLARE_API_TOKEN", getKeyAt: "https://dash.cloudflare.com/profile/api-tokens (a token with Workers AI read permission)" },
      { env: "CLOUDFLARE_ACCOUNT_ID", getKeyAt: "https://dash.cloudflare.com (Workers AI → Use REST API shows the account ID)" },
    ],
    create: (env, modelId) =>
      createOpenAICompatible({
        name: "cloudflare",
        baseURL: `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
        apiKey: env.CLOUDFLARE_API_TOKEN,
        transformRequestBody: emptyAssistantContent,
      }).chatModel(modelId),
    remainingTokensHeader: null,
    // Cloudflare's daily-limit wording is taken from its docs and never seen
    // for real, and it has no per-minute token limit to hit, so three limit
    // errors running means today is used up even if the text doesn't match.
    dailyAfterLimitErrors: 3,
  },
} satisfies Record<AgentProvider, ProviderInfo>;

export const providerLabel = (provider: AgentProvider): string => PROVIDERS[provider].label;

// One pool member, ready to call.
export type AgentConnection = {
  provider: AgentProvider;
  label: string;
  modelId: string;
  model: LanguageModel;
  // The values read from .env.local, so they can be kept out of every log.
  secrets: string[];
  dailyAfterLimitErrors: number | null;
};

/**
 * Connects one pool member. Throws, before any call, if a setting is missing.
 * With `onRemainingTokens`, each reply's count of tokens the provider has
 * left this minute is passed on, so the eval's pacer can follow its numbers.
 */
export function connectAgent(member: PoolMember, onRemainingTokens?: (tokens: number) => void): AgentConnection {
  const info: ProviderInfo = PROVIDERS[member.provider];
  const env = Object.fromEntries(info.env.map((source) => [source.env, requireApiKey(source)]));
  const base = info.create(env, member.modelId);
  const header = info.remainingTokensHeader;
  const model =
    onRemainingTokens && header !== null
      ? wrapLanguageModel({
          model: base,
          middleware: {
            specificationVersion: "v4",
            wrapGenerate: async ({ doGenerate }) => {
              const result = await doGenerate();
              const remaining = Number(result.response?.headers?.[header]);
              if (Number.isFinite(remaining)) onRemainingTokens(remaining);
              return result;
            },
          },
        })
      : base;
  return {
    provider: member.provider,
    label: info.label,
    modelId: member.modelId,
    model,
    secrets: Object.values(env),
    dailyAfterLimitErrors: info.dailyAfterLimitErrors,
  };
}

// The pool's keys as they are in .env.local, without connecting: for keeping
// them out of files written by commands that never call a model.
export const poolSecrets = (config: Config): (string | undefined)[] =>
  config.agent.pool.flatMap((m) => PROVIDERS[m.provider].env.map((source) => readOptionalEnv(source.env)));

// The playground and the terminal chat talk to the first provider in the pool.
export const firstInPool = (config: Config): PoolMember => config.agent.pool[0];

// Turns a failed model call into one plain sentence with what to do next.
export function describeModelError(error: unknown, member: PoolMember, stepTimeoutSeconds: number): string {
  const { label, env } = PROVIDERS[member.provider];
  const envNames = env.map((e) => e.env).join(" and ");
  if (error instanceof Error && error.name === "TimeoutError") {
    return `${label} didn't answer within ${stepTimeoutSeconds} seconds. It may be busy; try again, or raise agent.stepTimeoutSeconds in verifai.config.json.`;
  }
  const cause = RetryError.isInstance(error) ? error.lastError : error;
  if (APICallError.isInstance(cause)) {
    if (cause.statusCode === 429) {
      return `${label} says too many requests (429). Wait a minute and try again; if it keeps happening, today's free limit may be used up.`;
    }
    if (cause.statusCode === 503) {
      return `${label} is overloaded right now (503) and "${member.modelId}" isn't taking requests. Wait a minute and try again.`;
    }
    if (cause.statusCode === 404) {
      return `${label} doesn't know the model "${member.modelId}". Check its modelId in agent.pool in verifai.config.json.`;
    }
    if (cause.statusCode === 400 || cause.statusCode === 401 || cause.statusCode === 403) {
      return `${label} refused the request (${cause.statusCode}): ${cause.message.replace(/\.$/, "")}. If it's about the key, check ${envNames} in .env.local.`;
    }
    return `The ${label} call failed (${cause.statusCode ?? "no status"}): ${cause.message}`;
  }
  return `The ${label} call failed: ${cause instanceof Error ? cause.message : String(cause)}`;
}

// Whether a saved try's error is one of the messages above for a call that
// got no answer at all: the step timeout, or no status (DNS, a refused, reset
// or timed-out connection). For tries saved before such tries were dropped
// unsaved; the runner itself goes by the error, not its wording.
export const wasNoAnswer = (error: string): boolean => /didn't answer within \d+ seconds|call failed \(no status\)/.test(error);

// A rate limit is worth waiting out; any other failure isn't.
export function isRateLimited(error: unknown): boolean {
  const cause = RetryError.isInstance(error) ? error.lastError : error;
  return APICallError.isInstance(cause) && cause.statusCode === 429;
}
