// The judge model, from the config. Kept apart from the agent's pool: the
// judge is a different provider so the two never share a free limit.
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { APICallError, RetryError, type LanguageModel } from "ai";
import { readOptionalEnv, requireApiKey, type ApiKeySource, type JudgeConfig } from "../config";

type JudgeProviderInfo = {
  label: string;
  env: ApiKeySource;
  create: (apiKey: string, modelId: string) => Exclude<LanguageModel, string>;
};

const PROVIDERS = {
  gemini: {
    label: "Gemini",
    env: { env: "GOOGLE_GENERATIVE_AI_API_KEY", getKeyAt: "https://aistudio.google.com/apikey" },
    create: (apiKey, modelId) => createGoogleGenerativeAI({ apiKey })(modelId),
  },
} satisfies Record<JudgeConfig["provider"], JudgeProviderInfo>;

export type JudgeConnection = { label: string; model: LanguageModel; secrets: string[] };

// Throws, before any call, if the key is missing.
export function connectJudge(judge: JudgeConfig): JudgeConnection {
  const info: JudgeProviderInfo = PROVIDERS[judge.provider];
  const key = requireApiKey(info.env);
  return { label: info.label, model: info.create(key, judge.model), secrets: [key] };
}

// The judge's key as it is in .env.local, without connecting.
export const judgeSecrets = (judge: JudgeConfig): (string | undefined)[] => [readOptionalEnv(PROVIDERS[judge.provider].env.env)];

// The settings only this provider takes.
export function judgeProviderOptions(judge: JudgeConfig) {
  return { google: { thinkingConfig: { thinkingLevel: judge.thinkingLevel } } };
}

export function describeJudgeError(error: unknown, judge: JudgeConfig): string {
  const { label, env } = PROVIDERS[judge.provider];
  if (error instanceof Error && error.name === "TimeoutError") {
    return `${label} didn't answer within ${judge.stepTimeoutSeconds} seconds. Try again, or raise judge.stepTimeoutSeconds in verifai.config.json.`;
  }
  const cause = RetryError.isInstance(error) ? error.lastError : error;
  if (APICallError.isInstance(cause)) {
    if (cause.statusCode === 429) return `${label} says too many requests (429): ${cause.message}`;
    if (cause.statusCode === 404) return `${label} doesn't know the model "${judge.model}". Check judge.model in verifai.config.json.`;
    if (cause.statusCode === 400 || cause.statusCode === 401 || cause.statusCode === 403) {
      return `${label} refused the request (${cause.statusCode}): ${cause.message.replace(/\.$/, "")}. If it's about the key, check ${env.env} in .env.local.`;
    }
    return `The ${label} call failed (${cause.statusCode ?? "no status"}): ${cause.message}`;
  }
  return `The ${label} call failed: ${cause instanceof Error ? cause.message : String(cause)}`;
}
