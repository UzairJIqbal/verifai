import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseEnv } from "node:util";
import { z } from "zod";
import { REASONING_EFFORTS } from "./reasoning-effort";
import { VALIDATION_NAMES } from "./agent/validation-names";

// The nearest folder at or above where the command was started that holds the
// config. Not worked out from this file's own path: inside the Next.js build
// that path points into .next, not the project.
function findProjectRoot(): string {
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    if (existsSync(join(dir, "verifai.config.json"))) return dir;
    if (dirname(dir) === dir) {
      throw new Error("Couldn't find verifai.config.json. Run this from inside the project folder.");
    }
  }
}

export const PROJECT_ROOT = findProjectRoot();
const CONFIG_PATH = join(PROJECT_ROOT, "verifai.config.json");
const ENV_PATH = join(PROJECT_ROOT, ".env.local");

// Who can run the agent. Gemini is kept for the judge, so the two don't share a free limit.
export const AGENT_PROVIDERS = ["groq", "cloudflare"] as const;
export type AgentProvider = (typeof AGENT_PROVIDERS)[number];

export { REASONING_EFFORTS, type ReasoningEffort } from "./reasoning-effort";

export const versionName = z.string().regex(/^v\d+$/, "a version name looks like v1, v2, …");

// One provider's free-tier limits for this model. They change, so the config
// says when and where they were last read.
const freeTierLimits = z.strictObject({
  checked: z.string().min(1),
  requestsPerMinute: z.number().int().positive(),
  // Null where the provider has no such limit (Cloudflare has neither).
  tokensPerMinute: z.number().int().positive().nullable(),
  requestsPerDay: z.number().int().positive().nullable(),
  // Each provider counts its daily allowance in its own unit: Groq in tokens,
  // Cloudflare in "neurons". Each token weighs this many units per million.
  daily: z.strictObject({
    unit: z.string().min(1),
    allowance: z.number().positive(),
    unitsPerMillionTokens: z.strictObject({
      input: z.number().nonnegative(),
      cachedInput: z.number().nonnegative(),
      output: z.number().nonnegative(),
    }),
  }),
});
export type FreeTierLimits = z.infer<typeof freeTierLimits>;

// Cost is worked out from tokens even on the free tier, so cost per success
// can be compared across versions.
const prices = z.strictObject({
  checked: z.string().min(1),
  input: z.number().nonnegative(),
  cachedInput: z.number().nonnegative(),
  output: z.number().nonnegative(),
});
export type Prices = z.infer<typeof prices>;

const poolMember = z.strictObject({
  provider: z.enum(AGENT_PROVIDERS),
  // The provider's own name for agent.model.
  modelId: z.string().min(1),
  freeTierLimits,
  pricePerMillionTokensUsd: prices,
});
export type PoolMember = z.infer<typeof poolMember>;

// Who can be the judge. Only Gemini, so the judge never shares a free limit
// with the agent.
export const JUDGE_PROVIDERS = ["gemini"] as const;
export const THINKING_LEVELS = ["minimal", "low", "medium", "high"] as const;

const judgeSchema = z.strictObject({
  provider: z.enum(JUDGE_PROVIDERS),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2),
  // How long Gemini thinks before answering.
  thinkingLevel: z.enum(THINKING_LEVELS),
  // Longest wait for one call before giving up on that try.
  stepTimeoutSeconds: z.number().positive(),
  // agent/… holds the agent's words; judges/claims/<version>.md the claim checker's.
  claimsPromptVersion: versionName,
  // judges/rubric/<version>.md: the criteria the judge marks pass or fail.
  rubricVersion: versionName,
  freeTierLimits: z.strictObject({
    checked: z.string().min(1),
    requestsPerMinute: z.number().int().positive(),
    requestsPerDay: z.number().int().positive(),
  }),
});
export type JudgeConfig = z.infer<typeof judgeSchema>;

// The embedding model: for spotting near-duplicate regression tasks and for
// exemplar memory. Gemini, on the judge's key.
export const EMBEDDING_PROVIDERS = ["gemini"] as const;
const embeddingSchema = z.strictObject({
  provider: z.enum(EMBEDDING_PROVIDERS),
  model: z.string().min(1),
  dimensions: z.number().int().positive(),
  // A new task this similar (cosine) to an existing dev task is shown as a
  // near-duplicate before it's saved.
  nearDuplicateSimilarity: z.number().min(0).max(1),
});
export type EmbeddingConfig = z.infer<typeof embeddingSchema>;

export const configSchema = z.strictObject({
  agent: z
    .strictObject({
      // One model. The pool is the same model from several free providers, tried
      // in order: when one hits a limit, the next call goes to the next.
      model: z.string().min(1),
      pool: z.array(poolMember).min(1),
      temperature: z.number().min(0).max(2),
      maxSteps: z.number().int().positive(),
      // Longest wait for one step, retries included, before giving up.
      stepTimeoutSeconds: z.number().positive(),
      // How long gpt-oss thinks before answering. Its thinking is billed and
      // counted as output tokens, so this is the main lever on tokens per call.
      reasoningEffort: z.enum(REASONING_EFFORTS).default("low"),
    })
    .superRefine((agent, ctx) => {
      // A different model never joins the pool to get more quota: every
      // provider's name for it must end in the model's own name.
      const name = agent.model.split("/").at(-1) ?? agent.model;
      agent.pool.forEach((m, i) => {
        if (!m.modelId.endsWith(name)) {
          ctx.addIssue({ code: "custom", path: ["pool", i, "modelId"], message: `"${m.modelId}" isn't ${agent.model}. The pool only holds the same model.` });
        }
        if (agent.pool.findIndex((o) => o.provider === m.provider) !== i) {
          ctx.addIssue({ code: "custom", path: ["pool", i, "provider"], message: `${m.provider} is in the pool twice.` });
        }
      });
    }),
  runner: z.strictObject({
    triesPerTask: z.number().int().positive(),
    // Tries run at once. The per-minute token limit is what binds on the free
    // tier, and the runner paces itself under it whatever this is; 2 just
    // lets one try's tools run while another waits on the model.
    concurrency: z.number().int().positive(),
    // `pnpm eval --smoke` runs these dev tasks, one per category: a check that
    // the machinery works, never a score.
    smokeTasks: z.array(z.string().min(1)).min(1),
  }),
  // The promoted agent version: its name and the four things a candidate may
  // change, one at a time. Only a passing gate rewrites these.
  agentVersion: versionName,
  promptVersion: versionName,
  toolDescriptionsVersion: versionName,
  // A check run before a tool, or null for none.
  validation: z.enum(VALIDATION_NAMES).nullable(),
  // Add the most similar successful dev trajectories to the prompt.
  exemplars: z.boolean(),
  embedding: embeddingSchema,
  gate: z.strictObject({
    // A candidate fails if any category's success rate drops by more than
    // this many points, on dev or holdout.
    maxCategoryDropPoints: z.number().nonnegative(),
  }),
  judge: judgeSchema,
});
export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch (error) {
    throw new Error(`Couldn't read verifai.config.json: ${error instanceof Error ? error.message : String(error)}`);
  }
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`verifai.config.json is invalid:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

// A setting from the environment or .env.local, or undefined if it isn't set.
export function readOptionalEnv(name: string): string | undefined {
  const fromFile = existsSync(ENV_PATH) ? parseEnv(readFileSync(ENV_PATH, "utf8"))[name] : undefined;
  return process.env[name]?.trim() || fromFile?.trim() || undefined;
}

export type ApiKeySource = { env: string; getKeyAt: string };

// Fails before any model call, with the exact place to fix it. The key is
// returned to the caller and never printed or stored anywhere else.
// .env.local is read fresh on every call and never copied into process.env,
// so removing a key there takes effect in a running dev server at once.
export function requireApiKey({ env, getKeyAt }: ApiKeySource): string {
  const key = readOptionalEnv(env);
  if (!key) {
    throw new Error(
      `${env} is missing. Add this line to .env.local in the project root:\n` +
        `  ${env}=your-key\n` +
        `Get a key at ${getKeyAt}`,
    );
  }
  return key;
}
