// A candidate: the next agent version, as one change to the promoted one.
// Each lives in agent/candidates/<name>.json, says which failure category it
// goes after and why, and makes exactly one change: a prompt version, a
// tool-descriptions version, a validation step before a tool, or exemplar
// memory switched on.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { PROJECT_ROOT, versionName } from "../config";
import { VALIDATION_NAMES } from "../agent/validation-names";
import type { AgentKnobs } from "../agent/versions";

export const CANDIDATES_DIR = join(PROJECT_ROOT, "agent", "candidates");

// One key each, so a candidate can't change two things at once.
const changeSchema = z.union([
  z.strictObject({ promptVersion: versionName }),
  z.strictObject({ toolDescriptionsVersion: versionName }),
  z.strictObject({ validation: z.enum(VALIDATION_NAMES).nullable() }),
  z.strictObject({ exemplars: z.boolean() }),
]);
export type CandidateChange = z.infer<typeof changeSchema>;

export const candidateSchema = z.strictObject({
  // The agent version it becomes if it passes.
  name: versionName,
  // The promoted version it changes. The gate refuses a stale one.
  basedOn: versionName,
  // A category id from evals/review/taxonomy.json.
  targets: z.string().min(1),
  why: z.string().trim().min(1),
  change: changeSchema,
});
export type Candidate = z.infer<typeof candidateSchema>;

const NAME = /^v\d+$/;

export function readCandidate(name: string, dir: string = CANDIDATES_DIR): Candidate {
  if (!NAME.test(name)) throw new Error(`A candidate is named like v2, not "${name}".`);
  const path = join(dir, `${name}.json`);
  if (!existsSync(/*turbopackIgnore: true*/ path)) throw new Error(`There's no agent/candidates/${name}.json.`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(/*turbopackIgnore: true*/ path, "utf8"));
  } catch {
    throw new Error(`agent/candidates/${name}.json isn't valid JSON.`);
  }
  const parsed = candidateSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`agent/candidates/${name}.json isn't a valid candidate (exactly one change, see the others):\n${z.prettifyError(parsed.error)}`);
  if (parsed.data.name !== name) throw new Error(`agent/candidates/${name}.json says its name is ${parsed.data.name}.`);
  return parsed.data;
}

export const listCandidates = (dir: string = CANDIDATES_DIR): string[] =>
  existsSync(/*turbopackIgnore: true*/ dir)
    ? readdirSync(/*turbopackIgnore: true*/ dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.slice(0, -5))
        .filter((n) => NAME.test(n))
    : [];

// The one change, in words, for the gate's output and the changelog.
export function describeChange(change: CandidateChange, promoted: AgentKnobs): string {
  if ("promptVersion" in change) return `system prompt ${promoted.promptVersion} → ${change.promptVersion}`;
  if ("toolDescriptionsVersion" in change) return `tool descriptions ${promoted.toolDescriptionsVersion} → ${change.toolDescriptionsVersion}`;
  if ("validation" in change) return `validation step ${promoted.validation ?? "none"} → ${change.validation ?? "none"}`;
  return `exemplar memory ${promoted.exemplars ? "on" : "off"} → ${change.exemplars ? "on" : "off"}`;
}

/**
 * The candidate's agent: the promoted one with its single change. Refuses a
 * candidate built on another version, or one whose "change" is what the
 * promoted version already does.
 */
export function candidateKnobs(candidate: Candidate, promoted: AgentKnobs & { agentVersion: string }): AgentKnobs {
  if (candidate.basedOn !== promoted.agentVersion) {
    throw new Error(`${candidate.name} is based on ${candidate.basedOn}, but the promoted version is ${promoted.agentVersion}. Base it on ${promoted.agentVersion}.`);
  }
  if (candidate.name === promoted.agentVersion) throw new Error(`${candidate.name} is already the promoted version.`);
  const base: AgentKnobs = { promptVersion: promoted.promptVersion, toolDescriptionsVersion: promoted.toolDescriptionsVersion, validation: promoted.validation, exemplars: promoted.exemplars };
  const next: AgentKnobs = { ...base, ...candidate.change };
  if (JSON.stringify(next) === JSON.stringify(base)) throw new Error(`${candidate.name} changes nothing: the promoted version already has ${describeChange(candidate.change, base).split(" → ")[1]}.`);
  return next;
}
