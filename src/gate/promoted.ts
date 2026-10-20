// Which agent versions have been promoted, and what each one is. The config
// says what runs now, and it gets edited by hand (a run on another tool
// version, say), so it can't also be the record of what v1 is. This file is:
// the gate checks the config against its newest entry and appends to it on
// a promotion.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { PROJECT_ROOT, versionName } from "../config";
import { VALIDATION_NAMES } from "../agent/validation-names";
import type { PromotedKnobs } from "./record";

export const PROMOTED_FILE = join(PROJECT_ROOT, "agent", "promoted.json");

const promotedSchema = z
  .array(
    z.strictObject({
      agentVersion: versionName,
      promptVersion: versionName,
      toolDescriptionsVersion: versionName,
      validation: z.enum(VALIDATION_NAMES).nullable(),
      exemplars: z.boolean(),
    }),
  )
  .min(1, "It must name at least the first version.");

// Oldest first; the last one is the promoted version.
export function readPromoted(path: string = PROMOTED_FILE): PromotedKnobs[] {
  if (!existsSync(/*turbopackIgnore: true*/ path)) throw new Error("There's no agent/promoted.json, so the gate can't tell which version is promoted.");
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(/*turbopackIgnore: true*/ path, "utf8"));
  } catch {
    throw new Error("agent/promoted.json isn't valid JSON.");
  }
  const parsed = promotedSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`agent/promoted.json isn't a list of promoted versions:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

const KEYS = ["agentVersion", "promptVersion", "toolDescriptionsVersion", "validation", "exemplars"] as const;

/**
 * Throws unless the config is exactly the promoted version. Otherwise the gate
 * would measure the wrong agent as "promoted" and judge the candidate against
 * it, so it refuses whatever the reason the config was changed.
 */
export function checkConfigIsPromoted(config: PromotedKnobs, promoted: PromotedKnobs[]): PromotedKnobs {
  const current = promoted[promoted.length - 1];
  const wrong = KEYS.filter((k) => config[k] !== current[k]).map((k) => `"${k}" is ${JSON.stringify(config[k])}, the promoted version has ${JSON.stringify(current[k])}`);
  if (wrong.length > 0) {
    throw new Error(
      `verifai.config.json isn't on the promoted version ${current.agentVersion} (agent/promoted.json): ${wrong.join("; ")}. ` +
        `Set it back before gating; nothing was run.`,
    );
  }
  return current;
}

export function addPromoted(next: PromotedKnobs, path: string = PROMOTED_FILE): void {
  const all = [...readPromoted(path), next];
  writeFileSync(/*turbopackIgnore: true*/ path, `${JSON.stringify(promotedSchema.parse(all), null, 2)}\n`);
}
