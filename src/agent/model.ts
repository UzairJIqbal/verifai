import { createGroq } from "@ai-sdk/groq";
import { APICallError, RetryError, type LanguageModel } from "ai";
import type { AgentProvider, ApiKeySource, Config } from "../config";

type ProviderInfo = ApiKeySource & { label: string; create: (apiKey: string, model: string) => LanguageModel };

// Everything provider-specific in one place; the provider and model are picked in the config.
const PROVIDERS = {
  groq: {
    label: "Groq",
    env: "GROQ_API_KEY",
    getKeyAt: "https://console.groq.com/keys",
    create: (apiKey, model) => createGroq({ apiKey })(model),
  },
} satisfies Record<AgentProvider, ProviderInfo>;

export function agentProvider(config: Config): ProviderInfo {
  return PROVIDERS[config.agent.provider];
}

export function createAgentModel(config: Config, apiKey: string): LanguageModel {
  return agentProvider(config).create(apiKey, config.agent.model);
}

// Turns a failed model call into one plain sentence with what to do next.
export function describeModelError(error: unknown, config: Config): string {
  const { label, env } = agentProvider(config);
  if (error instanceof Error && error.name === "TimeoutError") {
    return `${label} didn't answer within ${config.agent.stepTimeoutSeconds} seconds. It may be busy; try again, or raise agent.stepTimeoutSeconds in verifai.config.json.`;
  }
  const cause = RetryError.isInstance(error) ? error.lastError : error;
  if (APICallError.isInstance(cause)) {
    if (cause.statusCode === 429) {
      return `${label} says too many requests (429). Wait a minute and try again; if it keeps happening, today's free limit may be used up.`;
    }
    if (cause.statusCode === 503) {
      return `${label} is overloaded right now (503) and "${config.agent.model}" isn't taking requests. Wait a minute and try again, or pick another model in agent.model in verifai.config.json.`;
    }
    if (cause.statusCode === 404) {
      return `${label} doesn't know the model "${config.agent.model}". Check agent.model in verifai.config.json.`;
    }
    if (cause.statusCode === 400 || cause.statusCode === 401 || cause.statusCode === 403) {
      return `${label} refused the request (${cause.statusCode}): ${cause.message.replace(/\.$/, "")}. If it's about the key, check ${env} in .env.local.`;
    }
    return `The model call failed (${cause.statusCode ?? "no status"}): ${cause.message}`;
  }
  return `The model call failed: ${cause instanceof Error ? cause.message : String(cause)}`;
}
