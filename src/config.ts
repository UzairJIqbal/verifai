import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseEnv } from "node:util";
import { z } from "zod";

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

// Who runs the agent. Gemini is kept for the judge, so the two don't share a free limit.
export const AGENT_PROVIDERS = ["groq"] as const;
export type AgentProvider = (typeof AGENT_PROVIDERS)[number];

const versionName = z.string().regex(/^v\d+$/, "a version name looks like v1, v2, …");

export const configSchema = z.strictObject({
  agent: z.strictObject({
    provider: z.enum(AGENT_PROVIDERS),
    model: z.string().min(1),
    temperature: z.number().min(0).max(2),
    maxSteps: z.number().int().positive(),
    // Longest wait for one step, retries included, before giving up.
    stepTimeoutSeconds: z.number().positive(),
  }),
  promptVersion: versionName,
  toolDescriptionsVersion: versionName,
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

export type ApiKeySource = { env: string; getKeyAt: string };

// Fails before any model call, with the exact place to fix it. The key is
// returned to the caller and never printed or stored anywhere else.
// .env.local is read fresh on every call and never copied into process.env,
// so removing a key there takes effect in a running dev server at once.
export function requireApiKey({ env, getKeyAt }: ApiKeySource): string {
  const fromFile = existsSync(ENV_PATH) ? parseEnv(readFileSync(ENV_PATH, "utf8"))[env] : undefined;
  const key = process.env[env]?.trim() || fromFile?.trim();
  if (!key) {
    throw new Error(
      `${env} is missing. Add this line to .env.local in the project root:\n` +
        `  ${env}=your-key\n` +
        `Get a key at ${getKeyAt}`,
    );
  }
  return key;
}
