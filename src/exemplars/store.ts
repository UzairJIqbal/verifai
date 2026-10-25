// Exemplar memory: dev conversations that went right, kept with an embedding
// of the customer's first message. A version with exemplars switched on gets
// the 2 most like the task in front of it added to its prompt. Only dev tries
// ever go in: a holdout one would teach the agent the test.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { canonical } from "../canonical";
import { PROJECT_ROOT } from "../config";
import { nearest } from "../embedding/embed";
import type { Step, Trial } from "../results/schema";
import type { Task } from "../tasks/schema";

export const EXEMPLARS_FILE = join(PROJECT_ROOT, "evals", "exemplars.jsonl");
// How many go into a prompt.
export const EXEMPLARS_PER_PROMPT = 2;
// A tool result longer than this is cut in the prompt: the shape is the lesson.
const RESULT_CHARS = 400;

export const exemplarSchema = z.strictObject({
  taskId: z.string(),
  runId: z.string(),
  tryNumber: z.number().int().positive(),
  datasetVersion: z.string(),
  // The agent version that had the conversation.
  promptVersion: z.string(),
  toolDescriptionsVersion: z.string(),
  firstMessage: z.string(),
  embeddingModel: z.string(),
  embedding: z.array(z.number()),
  transcript: z.array(z.string()),
  addedAt: z.string(),
});
export type Exemplar = z.infer<typeof exemplarSchema>;

const show = (path: string) => path.replace(`${PROJECT_ROOT}/`, "");

/**
 * Every exemplar, checked. `devTaskIds` is the dev split as the loader hands
 * it out: an entry for any other task (a holdout one, or one since removed)
 * stops everything, since a run using it would be tainted.
 */
export function readExemplars(devTaskIds: Set<string>, path: string = EXEMPLARS_FILE): Exemplar[] {
  if (!existsSync(/*turbopackIgnore: true*/ path)) return [];
  const out: Exemplar[] = [];
  readFileSync(/*turbopackIgnore: true*/ path, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (line.trim() === "") return;
      const where = `${show(path)} line ${i + 1}`;
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch {
        throw new Error(`${where} isn't valid JSON. Fix or remove that line.`);
      }
      const parsed = exemplarSchema.safeParse(raw);
      if (!parsed.success) throw new Error(`${where} isn't a valid exemplar:\n${z.prettifyError(parsed.error)}`);
      if (!devTaskIds.has(parsed.data.taskId)) {
        throw new Error(`${where} is from ${parsed.data.taskId}, which isn't a dev task. Exemplars may only come from dev tries; remove that line.`);
      }
      out.push(parsed.data);
    });
  return out;
}

export const appendExemplars = (entries: Exemplar[], path: string = EXEMPLARS_FILE): void => {
  if (entries.length > 0) appendFileSync(/*turbopackIgnore: true*/ path, entries.map((e) => `${JSON.stringify(exemplarSchema.parse(e))}\n`).join(""));
};

// Which store a run used, so a changed store is a changed configuration. The
// content counts too: an entry edited by hand is a different store.
export const exemplarStoreHash = (entries: Exemplar[]): string =>
  createHash("sha256")
    .update(
      canonical(
        [...entries]
          .sort((a, b) => a.taskId.localeCompare(b.taskId))
          .map((e) => ({ taskId: e.taskId, runId: e.runId, tryNumber: e.tryNumber, embeddingModel: e.embeddingModel, firstMessage: e.firstMessage, embedding: e.embedding, transcript: e.transcript })),
      ),
    )
    .digest("hex")
    .slice(0, 16);

/**
 * Refuses entries embedded by another model or at another size than the
 * config's: their similarity to a task's embedding would mean nothing, or
 * the comparison would fail halfway through a run.
 */
export function checkExemplarsFit(entries: Exemplar[], embedding: { model: string; dimensions: number }): void {
  const misfits = entries.filter((e) => e.embeddingModel !== embedding.model || e.embedding.length !== embedding.dimensions);
  if (misfits.length === 0) return;
  const which = misfits.map((e) => `${e.taskId} (${e.embeddingModel}, ${e.embedding.length} numbers)`).join(", ");
  throw new Error(
    `These exemplars weren't embedded with ${embedding.model} at ${embedding.dimensions} numbers, as the config says: ${which}. ` +
      "Remove their lines from evals/exemplars.jsonl and add them again with `pnpm exemplars:add <dev run>`.",
  );
}

// A try worth copying: it passed, and so did every grader, including the
// policy ones that don't decide a pass. A try that passed while attempting a
// forbidden refund would teach exactly the wrong thing.
export const isExemplary = (t: Trial): boolean => t.status === "passed" && t.verdicts.every((v) => v.pass && !v.ungraded);

const cut = (text: string) => (text.length > RESULT_CHARS ? `${text.slice(0, RESULT_CHARS)}…` : text);

// The conversation as the agent will read it: who said what, and every tool
// call with its input and result.
export function transcriptOf(steps: Step[]): string[] {
  const lines: string[] = [];
  for (const s of steps) {
    if (s.type === "customer") lines.push(`Customer: ${s.text}`);
    else if (s.type === "text") lines.push(`Agent: ${s.text}`);
    else if (s.type === "tool-call") lines.push(`Tool call: ${s.toolName} ${JSON.stringify(s.input)}`);
    else if (s.type === "tool-result") lines.push(`Tool result: ${cut(s.outcome.ok ? JSON.stringify(s.outcome.value) : `error: ${s.outcome.error}`)}`);
  }
  return lines;
}

/**
 * The exemplars for one task: the most similar by first message, never the
 * task's own (that would hand it the answer).
 */
export function pickExemplars(task: Pick<Task, "id">, query: number[], entries: Exemplar[], k: number = EXEMPLARS_PER_PROMPT): Exemplar[] {
  const others = entries.filter((e) => e.taskId !== task.id).map((e) => ({ id: e.taskId, vector: e.embedding, entry: e }));
  return nearest(query, others, k).map((n) => n.item.entry);
}

// What's added to the end of the system prompt.
export function exemplarBlock(picked: Exemplar[]): string {
  if (picked.length === 0) return "";
  const examples = picked.map((e, i) => [`### Example ${i + 1}`, ...e.transcript].join("\n")).join("\n\n");
  return (
    "\n\n## Conversations that went right\n\n" +
    "These are past conversations with other customers that were handled correctly. Follow how they used the tools and the policy. " +
    "Their customers, orders and amounts are not this customer's: never reuse an id, a name or an amount from them.\n\n" +
    examples
  );
}
