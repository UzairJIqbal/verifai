// `pnpm exemplars:add <runId>`: copies a finished dev run's best tries into
// exemplar memory, one per task not already there, with an embedding of each
// first message. Refuses anything that isn't a dev run. Asks before the one
// embedding call.
import { styleText } from "node:util";
import { loadConfig } from "../src/config";
import { connectEmbedder, embedTexts, embeddingSecrets, uncachedTexts } from "../src/embedding/embed";
import { EVAL_STORE_PATH, EvalStore } from "../src/eval/store";
import { makeRedactor } from "../src/eval/redact";
import { ask, dim, fatal } from "../src/eval/session";
import { appendExemplars, EXEMPLARS_FILE, isExemplary, readExemplars, transcriptOf, type Exemplar } from "../src/exemplars/store";
import { devTrials, readRun } from "../src/results/read";
import { loadTasks } from "../src/tasks/load";

const USAGE = "Usage: pnpm exemplars:add <runId>   (a finished, full dev run under results/)";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 1) fatal(USAGE);
  const [runId] = args;
  let config;
  let dev;
  let existing: Exemplar[];
  let files;
  try {
    config = loadConfig();
    dev = loadTasks();
    existing = readExemplars(new Set(dev.tasks.map((t) => t.id)));
    files = readRun(runId);
  } catch (error) {
    fatal(error instanceof Error ? error.message : String(error));
  }
  if (files === null) fatal(`There's no run ${runId} under results/. The runs page lists them.`);
  const { report } = files;
  if (report.split !== "dev") fatal(`${runId} is a holdout run. Exemplars only ever come from dev runs.`);
  if (report.smoke) fatal(`${runId} is a smoke run. Use a full \`pnpm eval\` run.`);
  const trials = devTrials(files);
  if (trials === null) fatal(`${runId} isn't a readable dev run.`);
  if (report.agent.exemplars) fatal(`${runId} already used exemplars. Copy from a run without them, so exemplars don't feed on themselves.`);

  const devIds = new Set(dev.tasks.map((t) => t.id));
  const have = new Set(existing.map((e) => e.taskId));
  const byId = new Map(dev.tasks.map((t) => [t.id, t]));
  // The first exemplary try of each task, for tasks the store doesn't have.
  const picked = new Map<string, (typeof trials)[number]>();
  for (const t of [...trials].sort((a, b) => a.tryNumber - b.tryNumber)) {
    if (devIds.has(t.taskId) && !have.has(t.taskId) && !picked.has(t.taskId) && isExemplary(t)) picked.set(t.taskId, t);
  }
  const notDev = new Set(trials.map((t) => t.taskId).filter((id) => !devIds.has(id)));

  console.log(styleText("bold", `VerifAI exemplars · run ${runId} · dataset ${report.datasetVersion} · agent prompt ${report.agent.promptVersion} · tools ${report.agent.toolDescriptionsVersion}`));
  console.log(dim(`  ${existing.length} already in ${EXEMPLARS_FILE.split("/").slice(-2).join("/")} · a try qualifies if it passed and every grader passed`));
  if (notDev.size > 0) console.log(styleText("yellow", `  Skipped ${notDev.size} task(s) no longer in the dev split: ${[...notDev].sort().join(", ")}`));
  if (picked.size === 0) {
    console.log("Nothing to add: every task with a qualifying try is already in the store.");
    return;
  }
  console.log(`  Adding ${picked.size}: ${[...picked.keys()].sort().join(", ")}`);

  const store = new EvalStore(EVAL_STORE_PATH, makeRedactor(embeddingSecrets(config.embedding)));
  const texts = [...picked.keys()].map((id) => byId.get(id)?.first_message ?? "");
  const toSend = uncachedTexts(store, config.embedding, texts);
  console.log(`\nEstimate: ${toSend.length === 0 ? "0 calls (every embedding is cached)" : `1 embedding call to Gemini ${config.embedding.model} for ${toSend.length} texts`} · agent and judge: 0 calls\n`);

  if (toSend.length > 0) {
    if (!process.stdin.isTTY) fatal("pnpm exemplars:add asks before spending a call, so run it in a terminal.");
    if (!(await ask("Add them? [y/N] "))) {
      console.log("Nothing sent, nothing added.");
      return store.close();
    }
  }
  let vectors: number[][];
  try {
    // Connected only now: with everything cached there's nothing to send.
    const send = toSend.length === 0 ? async () => [] : connectEmbedder(config.embedding).send;
    vectors = await embedTexts(store, config.embedding, texts, send);
  } catch (error) {
    store.close();
    fatal(`The embedding call failed: ${error instanceof Error ? error.message : String(error)}. Nothing was added.`);
  }
  store.close();
  const now = new Date().toISOString();
  const entries: Exemplar[] = [...picked.values()].map((t, i) => ({
    taskId: t.taskId,
    runId,
    tryNumber: t.tryNumber,
    datasetVersion: report.datasetVersion,
    promptVersion: report.agent.promptVersion,
    toolDescriptionsVersion: report.agent.toolDescriptionsVersion,
    firstMessage: texts[i],
    embeddingModel: config.embedding.model,
    embedding: vectors[i],
    transcript: transcriptOf(t.steps),
    addedAt: now,
  }));
  appendExemplars(entries);
  console.log(styleText("green", `✓ Added ${entries.length} exemplars (${existing.length + entries.length} in all).`));
  console.log(dim("  A version uses them only with \"exemplars\": true in a candidate; changing the store changes that version's configuration."));
}

void main();
