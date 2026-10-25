import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { PROJECT_ROOT } from "../config";
import { TOOL_NAMES, type PreCheck, type ToolName } from "./tools";
import { VALIDATIONS, type ValidationName } from "./validation";

const AGENT_DIR = join(PROJECT_ROOT, "agent");

// Only the shop's tools may be in the file. A tool left out isn't offered to
// the agent at all, so a version can take one away; at least one must stay.
const toolDescriptionsSchema = z
  .partialRecord(z.enum(TOOL_NAMES), z.string().trim().min(1))
  .refine((d) => Object.keys(d).length > 0, "It must describe at least one tool.");

export type ToolDescriptions = Partial<Record<ToolName, string>>;

// The tools a version offers, always in the shop's order so the model sees
// the same list and the cache key doesn't change with the file's order.
export const offeredTools = (descriptions: ToolDescriptions): ToolName[] => TOOL_NAMES.filter((name) => descriptions[name] !== undefined);

// What an agent version is made of: the four things a candidate may change.
// The config holds the promoted version's; a candidate changes one.
export type AgentKnobs = {
  promptVersion: string;
  toolDescriptionsVersion: string;
  validation: ValidationName | null;
  exemplars: boolean;
};

export const knobsOf = (k: AgentKnobs): AgentKnobs => ({
  promptVersion: k.promptVersion,
  toolDescriptionsVersion: k.toolDescriptionsVersion,
  validation: k.validation,
  exemplars: k.exemplars,
});

// e.g. "prompt v1 · tools v1 · validation refund-limit · exemplars".
export function knobsLabel(k: AgentKnobs): string {
  return [`prompt ${k.promptVersion}`, `tools ${k.toolDescriptionsVersion}`, ...(k.validation ? [`validation ${k.validation}`] : []), ...(k.exemplars ? ["exemplars"] : [])].join(" · ");
}

export type AgentVersion = {
  promptVersion: string;
  toolDescriptionsVersion: string;
  validation: ValidationName | null;
  // Whether similar successful dev trajectories are added to the prompt. The
  // runner adds them per task; `systemPrompt` here is without them.
  exemplars: boolean;
  // What the agent reports as its version, e.g. "prompt v1 · tools v1".
  label: string;
  systemPrompt: string;
  // The policy as it appears in the prompt. The hallucination checks count
  // what's written in it as known.
  policy: string;
  toolDescriptions: ToolDescriptions;
};

function readAgentFile(...parts: string[]): string {
  const path = join(AGENT_DIR, ...parts);
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new Error(`Couldn't read agent/${parts.join("/")}. Check the version names in verifai.config.json.`);
  }
}

export const loadPolicy = (): string => readAgentFile("policy.md").trim();

export function loadAgentVersion(knobs: AgentKnobs, today: string): AgentVersion {
  const template = readAgentFile("prompts", `${knobs.promptVersion}.md`);
  const policy = loadPolicy();
  for (const placeholder of ["{{today}}", "{{policy}}"]) {
    if (!template.includes(placeholder)) {
      throw new Error(`agent/prompts/${knobs.promptVersion}.md is missing the ${placeholder} placeholder.`);
    }
  }
  const systemPrompt = template.replaceAll("{{today}}", today).replaceAll("{{policy}}", policy);

  return {
    promptVersion: knobs.promptVersion,
    toolDescriptionsVersion: knobs.toolDescriptionsVersion,
    validation: knobs.validation,
    exemplars: knobs.exemplars,
    label: knobsLabel(knobs),
    systemPrompt,
    policy,
    toolDescriptions: loadToolDescriptions(knobs.toolDescriptionsVersion),
  };
}

// The version's validation step, in the form the tool runner takes.
export function preCheckOf(version: Pick<AgentVersion, "validation">): PreCheck | null {
  return version.validation === null ? null : VALIDATIONS[version.validation];
}

export function loadToolDescriptions(version: string): ToolDescriptions {
  const file = `${version}.json`;
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
  return parsed.data;
}
