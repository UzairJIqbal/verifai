// What a run is: its saved configuration, the fingerprint that tells whether
// an unfinished run can be carried on, and its id.
import { createHash, randomBytes } from "node:crypto";
import type { ModelMessage } from "ai";
import { canonical } from "../canonical";
import type { Config } from "../config";
import { describeTools, type ModelRequest } from "../agent/loop";
import type { AgentVersion } from "../agent/versions";
import type { Split, Task } from "../tasks/schema";
import type { RunConfig } from "./store";

const sha256 = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");

// Which tasks a run was made on, exactly: a regrade checks it before reusing them.
export const tasksHash = (tasks: Task[]): string => sha256(tasks);

export function buildRunConfig(args: {
  config: Config;
  version: AgentVersion;
  datasetVersion: string;
  split: Split;
  tasks: Task[];
  useCache: boolean;
  smoke: boolean;
  // The exemplar store, when the version uses one.
  exemplars?: { storeHash: string; entries: number } | null;
}): RunConfig {
  const { config, version } = args;
  if (version.exemplars && !args.exemplars) throw new Error("This version uses exemplars, but no exemplar store was given for the run.");
  return {
    agent: {
      model: config.agent.model,
      pool: config.agent.pool.map((m) => ({
        provider: m.provider,
        modelId: m.modelId,
        prices: { input: m.pricePerMillionTokensUsd.input, cachedInput: m.pricePerMillionTokensUsd.cachedInput, output: m.pricePerMillionTokensUsd.output },
      })),
      temperature: config.agent.temperature,
      maxSteps: config.agent.maxSteps,
      stepTimeoutSeconds: config.agent.stepTimeoutSeconds,
      reasoningEffort: config.agent.reasoningEffort,
    },
    promptVersion: version.promptVersion,
    toolDescriptionsVersion: version.toolDescriptionsVersion,
    ...(version.validation !== null ? { validation: version.validation } : {}),
    ...(version.exemplars && args.exemplars
      ? { exemplars: { ...args.exemplars, embeddingModel: config.embedding.model, dimensions: config.embedding.dimensions } }
      : {}),
    datasetVersion: args.datasetVersion,
    split: args.split,
    smoke: args.smoke,
    triesPerTask: config.runner.triesPerTask,
    useCache: args.useCache,
    agentHash: sha256({ systemPrompt: version.systemPrompt, tools: describeTools(version.toolDescriptions) }),
    tasksHash: tasksHash(args.tasks),
  };
}

// Two runs with the same fingerprint would give the same results, so an
// unfinished one is carried on instead of starting another.
export const runFingerprint = (config: RunConfig): string => sha256(config);

// The configuration a noise floor belongs to: everything that decides how the
// agent behaves on which tasks. The cache is left out because the noise runs
// skip it and the runs they're compared with may not.
export const configKey = (config: RunConfig): string => sha256({ ...config, useCache: null }).slice(0, 16);

// e.g. 20261015-142233-3fa9: sorts by when it started, and never collides.
export function newRunId(now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return `${stamp}-${randomBytes(2).toString("hex")}`;
}

// The first model request of a task's try, exactly as the loop will send it.
export function firstRequest(version: AgentVersion, task: Task): ModelRequest {
  const messages: ModelMessage[] = [{ role: "user", content: task.first_message }];
  return { instructions: version.systemPrompt, messages, tools: describeTools(version.toolDescriptions) };
}
