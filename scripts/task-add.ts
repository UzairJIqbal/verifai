// `pnpm task:add <id>`: adds a finished draft from evals/drafts/ to dev. Checks
// its reference calls produce its expected changes, shows the most similar dev
// tasks by embedding (near-duplicates flagged), and asks first. Adding bumps
// the dataset version. At most one embedding call, for texts not cached.
import { rmSync } from "node:fs";
import { styleText } from "node:util";
import { loadConfig } from "../src/config";
import { connectEmbedder, embedTexts, embeddingSecrets, nearest, uncachedTexts } from "../src/embedding/embed";
import { EVAL_STORE_PATH, EvalStore } from "../src/eval/store";
import { makeRedactor } from "../src/eval/redact";
import { ask, dim, fatal } from "../src/eval/session";
import { draftPath, readDraft } from "../src/tasks/draft";
import { addDevTask, loadTasks, nextDatasetVersion } from "../src/tasks/load";

const USAGE = "Usage: pnpm task:add <id>   (a draft in evals/drafts/, e.g. pnpm task:add refund-11)";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 1) fatal(USAGE);
  let config;
  let dev;
  let draft;
  try {
    config = loadConfig();
    dev = loadTasks();
    const from = readDraft(args[0], null).from;
    draft = readDraft(args[0], dev.tasks.find((t) => t.id === from.taskId) ?? null);
  } catch (error) {
    fatal(error instanceof Error ? error.message : String(error));
  }
  const { task, from } = draft;
  const next = nextDatasetVersion(dev.version);

  console.log(styleText("bold", `VerifAI task:add · ${task.id} (${task.category}, ${task.difficulty}) · dataset ${dev.version} → ${next}`));
  console.log(dim(`  from ${from.runId}/${from.taskId}#${from.tryNumber}${from.failureCategory ? ` · ${from.failureCategory}` : ""}`));

  // Near-duplicates are looked for among dev tasks only: holdout content is
  // never read outside the gate.
  const store = new EvalStore(EVAL_STORE_PATH, makeRedactor(embeddingSecrets(config.embedding)));
  const texts = [task.first_message, ...dev.tasks.map((t) => t.first_message)];
  const toSend = uncachedTexts(store, config.embedding, texts);
  console.log(`\nEstimate: ${toSend.length === 0 ? "0 calls (every embedding is cached)" : `1 embedding call to Gemini ${config.embedding.model} for ${toSend.length} texts`} · agent and judge: 0 calls`);
  if (toSend.length > 0) {
    if (!process.stdin.isTTY) fatal("pnpm task:add asks before spending a call, so run it in a terminal.");
    if (!(await ask("Look for near-duplicates? [y/N] "))) {
      store.close();
      return void console.log("Nothing sent, nothing added.");
    }
  }
  let vectors: number[][];
  try {
    const send = toSend.length === 0 ? async () => [] : connectEmbedder(config.embedding).send;
    vectors = await embedTexts(store, config.embedding, texts, send);
  } catch (error) {
    store.close();
    fatal(`The embedding call failed: ${error instanceof Error ? error.message : String(error)}. Nothing was added.`);
  }
  store.close();

  const [query, ...rest] = vectors;
  const similar = nearest(query, dev.tasks.map((t, i) => ({ id: t.id, vector: rest[i] })), 3);
  const threshold = config.embedding.nearDuplicateSimilarity;
  console.log(`\nMost similar dev tasks ${dim(`(cosine similarity of first messages; ${threshold} or more is a near-duplicate)`)}`);
  for (const { item, similarity } of similar) {
    const text = `  ${item.id.padEnd(12)} ${similarity.toFixed(3)}  ${dev.tasks.find((t) => t.id === item.id)?.first_message.slice(0, 80) ?? ""}`;
    console.log(similarity >= threshold ? styleText("yellow", `${text}  ← near-duplicate`) : text);
  }
  if (similar.some((s) => s.similarity >= threshold)) console.log(styleText("yellow", "  A near-duplicate adds little: consider asking differently."));

  console.log("");
  if (!process.stdin.isTTY) fatal("pnpm task:add asks before changing the tasks, so run it in a terminal.");
  if (!(await ask(`Add ${task.id} to dev as dataset ${next}? Every score so far is on ${dev.version}. [y/N] `))) return void console.log("Nothing added.");
  try {
    const reason = `Regression task from ${from.runId}/${from.taskId}#${from.tryNumber}${from.failureCategory ? ` (${from.failureCategory})` : ""}.`;
    const { version } = addDevTask(task, reason);
    rmSync(draftPath(task.id));
    console.log(styleText("green", `✓ ${task.id} added. The dataset is now ${version}; the draft was removed.`));
    console.log(dim(`  Runs on ${dev.version} aren't comparable with ${version}. \`pnpm gate\` reruns the promoted version on ${version} first.`));
  } catch (error) {
    fatal(error instanceof Error ? error.message : String(error));
  }
}

void main();
