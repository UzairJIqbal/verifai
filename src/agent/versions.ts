import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { PROJECT_ROOT, type Config } from "../config";
import { TOOL_NAMES, type ToolName } from "./tools";

const AGENT_DIR = join(PROJECT_ROOT, "agent");

// Every tool must have a description, and nothing else may be in the file.
const toolDescriptionsSchema = z.record(z.enum(TOOL_NAMES), z.string().trim().min(1));

export type AgentVersion = {
  promptVersion: string;
  toolDescriptionsVersion: string;
  // What the agent reports as its version, e.g. "prompt v1 · tools v1".
  label: string;
  systemPrompt: string;
  toolDescriptions: Record<ToolName, string>;
};

function readAgentFile(...parts: string[]): string {
  const path = join(AGENT_DIR, ...parts);
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new Error(`Couldn't read agent/${parts.join("/")}. Check the version names in verifai.config.json.`);
  }
}

export function loadAgentVersion(config: Config, today: string): AgentVersion {
  const template = readAgentFile("prompts", `${config.promptVersion}.md`);
  const policy = readAgentFile("policy.md").trim();
  for (const placeholder of ["{{today}}", "{{policy}}"]) {
    if (!template.includes(placeholder)) {
      throw new Error(`agent/prompts/${config.promptVersion}.md is missing the ${placeholder} placeholder.`);
    }
  }
  const systemPrompt = template.replaceAll("{{today}}", today).replaceAll("{{policy}}", policy);

  const file = `${config.toolDescriptionsVersion}.json`;
  let raw: unknown;
  try {
    raw = JSON.parse(readAgentFile("tool-descriptions", file));
  } catch (error) {
    throw new Error(`agent/tool-descriptions/${file} isn't valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const parsed = toolDescriptionsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`agent/tool-descriptions/${file} is invalid:\n${z.prettifyError(parsed.error)}`);
  }

  return {
    promptVersion: config.promptVersion,
    toolDescriptionsVersion: config.toolDescriptionsVersion,
    label: `prompt ${config.promptVersion} · tools ${config.toolDescriptionsVersion}`,
    systemPrompt,
    toolDescriptions: parsed.data,
  };
}
