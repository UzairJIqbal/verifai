// The eval store: runs, trials, steps, grades, the response cache and our own
// count of calls made. The source of truth for every number; the results files
// are written from it, and nothing is ever read back from Langfuse.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { z } from "zod";
import { PROJECT_ROOT, REASONING_EFFORTS } from "../config";
import { SPLITS } from "../tasks/schema";
import { stepSchema, TRIAL_STATUSES, recordedTrialSchema, verdictSchema, type RecordedTrial } from "../results/schema";
import type { Redact } from "./redact";
import type { Verdict } from "./trajectory";

export const EVAL_STORE_PATH = join(PROJECT_ROOT, "data", "evals.db");

// Everything that decides a run's results, saved with it. A resumed run uses
// this, not whatever the config file says today.
const pricesSchema = z.object({ input: z.number(), cachedInput: z.number(), output: z.number() });
export type RunPrices = z.infer<typeof pricesSchema>;

export const runConfigSchema = z.object({
  agent: z.object({
    model: z.string(),
    // The providers that may answer, in the order they're tried. Two runs
    // with different pools are never the same run.
    pool: z.array(z.object({ provider: z.string(), modelId: z.string(), prices: pricesSchema })).min(1),
    temperature: z.number(),
    maxSteps: z.number().int(),
    stepTimeoutSeconds: z.number(),
    reasoningEffort: z.enum(REASONING_EFFORTS),
  }),
  promptVersion: z.string(),
  toolDescriptionsVersion: z.string(),
  datasetVersion: z.string(),
  split: z.enum(SPLITS),
  // A smoke run checks the machinery on a few tasks. It's never a score,
  // a comparison or a gate, and never carried on as a full run.
  smoke: z.boolean(),
  triesPerTask: z.number().int().positive(),
  useCache: z.boolean(),
  // Hashes of the prompt and tool descriptions as sent, and of the tasks. A
  // file edited without bumping its version changes these, so an old run is
  // never carried on with different words.
  agentHash: z.string(),
  tasksHash: z.string(),
});
export type RunConfig = z.infer<typeof runConfigSchema>;

export const RUN_STATUSES = ["running", "finished"] as const;

const runRowSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  finished_at: z.string().nullable(),
  status: z.enum(RUN_STATUSES),
  fingerprint: z.string(),
  config_json: z.string(),
});

export type StoredRun = { id: string; createdAt: string; finishedAt: string | null; status: (typeof RUN_STATUSES)[number]; config: RunConfig };

const trialRowSchema = z.object({
  task_id: z.string(),
  try: z.number(),
  category: z.string(),
  status: z.enum(TRIAL_STATUSES),
  end_reason: z.string().nullable(),
  error: z.string().nullable(),
  calls: z.number(),
  cached_calls: z.number(),
  input_tokens: z.number(),
  cached_input_tokens: z.number(),
  output_tokens: z.number(),
  cost_usd: z.number(),
  model_latency_ms: z.number(),
  started_at: z.string(),
  finished_at: z.string(),
  trace_url: z.string().nullable(),
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  config_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trials (
  run_id TEXT NOT NULL REFERENCES runs(id),
  task_id TEXT NOT NULL,
  try INTEGER NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL,
  end_reason TEXT,
  error TEXT,
  calls INTEGER NOT NULL,
  cached_calls INTEGER NOT NULL,
  input_tokens INTEGER NOT NULL,
  cached_input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  model_latency_ms INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  trace_url TEXT,
  PRIMARY KEY (run_id, task_id, try)
);
CREATE TABLE IF NOT EXISTS steps (
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  try INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (run_id, task_id, try, seq)
);
CREATE TABLE IF NOT EXISTS grades (
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  try INTEGER NOT NULL,
  grader TEXT NOT NULL,
  pass INTEGER NOT NULL,
  reason TEXT NOT NULL,
  step INTEGER,
  ungraded INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (run_id, task_id, try, grader)
);
CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  response_json TEXT NOT NULL
);
-- Every call actually sent, cached ones not included: our own count of what
-- today's free limit has left.
CREATE TABLE IF NOT EXISTS provider_calls (
  id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  cached_input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS provider_calls_at ON provider_calls (provider, at);
-- A noise measurement in progress: the two identical runs it's made of, so
-- \`pnpm noise\` carries on the same pair across days.
CREATE TABLE IF NOT EXISTS noise_measurements (
  config_key TEXT PRIMARY KEY,
  run_a TEXT REFERENCES runs(id),
  run_b TEXT REFERENCES runs(id)
);
`;

export type NoiseMeasurement = { configKey: string; runA: string | null; runB: string | null };
const noiseRowSchema = z.object({ config_key: z.string(), run_a: z.string().nullable(), run_b: z.string().nullable() });

export type ProviderUsage = { calls: number; inputTokens: number; cachedInputTokens: number; outputTokens: number };

const usageRowSchema = z.object({ calls: z.number(), input: z.number().nullable(), cached: z.number().nullable(), output: z.number().nullable() });
const averageRowSchema = z.object({ n: z.number(), average: z.number().nullable() });

export class EvalStore {
  private readonly db: DatabaseSync;

  constructor(
    path: string,
    // Applied to every string written, so a key can't reach the store even
    // if it somehow got into a model message.
    private readonly redact: Redact,
  ) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.db.exec(SCHEMA);
    this.migrate();
  }

  // Stores made before verdicts pointed at a step: add the columns. Their old
  // grades keep a null step and count as graded, which they were.
  private migrate(): void {
    const columns = z.array(z.object({ name: z.string() })).parse(this.db.prepare("PRAGMA table_info(grades)").all());
    const has = new Set(columns.map((c) => c.name));
    if (!has.has("step")) this.db.exec("ALTER TABLE grades ADD COLUMN step INTEGER");
    if (!has.has("ungraded")) this.db.exec("ALTER TABLE grades ADD COLUMN ungraded INTEGER NOT NULL DEFAULT 0");
  }

  close(): void {
    this.db.close();
  }

  private json(value: unknown): string {
    return this.redact(JSON.stringify(value));
  }

  private transaction(work: () => void): void {
    this.db.exec("BEGIN");
    try {
      work();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  createRun(run: { id: string; createdAt: string; fingerprint: string; config: RunConfig }): void {
    this.db
      .prepare("INSERT INTO runs (id, created_at, status, fingerprint, config_json) VALUES (?, ?, 'running', ?, ?)")
      .run(run.id, run.createdAt, run.fingerprint, this.json(run.config));
  }

  private toRun(row: unknown): StoredRun {
    const r = runRowSchema.parse(row);
    const config = runConfigSchema.safeParse(JSON.parse(r.config_json));
    if (!config.success) throw new Error(`Run ${r.id} in the eval store has a config this code can't read.`);
    return { id: r.id, createdAt: r.created_at, finishedAt: r.finished_at, status: r.status, config: config.data };
  }

  getRun(id: string): StoredRun | null {
    const row = this.db.prepare("SELECT * FROM runs WHERE id = ?").get(id);
    return row === undefined ? null : this.toRun(row);
  }

  // The newest unfinished run with exactly this configuration: the one a
  // repeated `pnpm eval` carries on.
  findUnfinishedRun(fingerprint: string): StoredRun | null {
    const row = this.db
      .prepare("SELECT * FROM runs WHERE status = 'running' AND fingerprint = ? ORDER BY created_at DESC, id DESC LIMIT 1")
      .get(fingerprint);
    return row === undefined ? null : this.toRun(row);
  }

  // Newest first.
  finishedRuns(): StoredRun[] {
    return this.db.prepare("SELECT * FROM runs WHERE status = 'finished' ORDER BY created_at DESC, id DESC").all().map((row) => this.toRun(row));
  }

  unfinishedRuns(): StoredRun[] {
    return this.db.prepare("SELECT * FROM runs WHERE status = 'running' ORDER BY created_at DESC").all().map((row) => this.toRun(row));
  }

  // The measurement under way for a configuration; it's removed once its
  // floor is saved, so measuring again starts a new pair.
  noiseMeasurement(configKey: string): NoiseMeasurement | null {
    const row = this.db.prepare("SELECT * FROM noise_measurements WHERE config_key = ?").get(configKey);
    if (row === undefined) return null;
    const r = noiseRowSchema.parse(row);
    return { configKey: r.config_key, runA: r.run_a, runB: r.run_b };
  }

  saveNoiseMeasurement(m: NoiseMeasurement): void {
    this.db.prepare("INSERT OR REPLACE INTO noise_measurements (config_key, run_a, run_b) VALUES (?, ?, ?)").run(m.configKey, m.runA, m.runB);
  }

  clearNoiseMeasurement(configKey: string): void {
    this.db.prepare("DELETE FROM noise_measurements WHERE config_key = ?").run(configKey);
  }

  finishRun(id: string, finishedAt: string): void {
    this.db.prepare("UPDATE runs SET status = 'finished', finished_at = ? WHERE id = ?").run(finishedAt, id);
  }

  // "task#try" for every try of the run that has a saved outcome.
  finishedTries(runId: string): Set<string> {
    const rows = z.array(z.object({ task_id: z.string(), try: z.number() })).parse(
      this.db.prepare("SELECT task_id, try FROM trials WHERE run_id = ?").all(runId),
    );
    return new Set(rows.map((r) => tryKey(r.task_id, r.try)));
  }

  // A try is saved whole or not at all: its row, every step and every grade
  // in one transaction. A try that was cut off leaves nothing, and is redone.
  saveTrial(runId: string, trial: RecordedTrial): void {
    this.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO trials (run_id, task_id, try, category, status, end_reason, error, calls, cached_calls,
             input_tokens, cached_input_tokens, output_tokens, cost_usd, model_latency_ms, started_at, finished_at, trace_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          runId,
          trial.taskId,
          trial.tryNumber,
          trial.category,
          trial.status,
          trial.end,
          trial.error === null ? null : this.redact(trial.error),
          trial.calls,
          trial.cachedCalls,
          trial.usage.inputTokens,
          trial.usage.cachedInputTokens,
          trial.usage.outputTokens,
          trial.costUsd,
          trial.modelLatencyMs,
          trial.startedAt,
          trial.finishedAt,
          trial.traceUrl,
        );
      const step = this.db.prepare("INSERT INTO steps (run_id, task_id, try, seq, type, payload_json) VALUES (?, ?, ?, ?, ?, ?)");
      trial.steps.forEach((s, seq) => step.run(runId, trial.taskId, trial.tryNumber, seq, s.type, this.json(s)));
      this.insertGrades(runId, trial.taskId, trial.tryNumber, trial.verdicts);
    });
  }

  private insertGrades(runId: string, taskId: string, tryNumber: number, verdicts: Verdict[]): void {
    const grade = this.db.prepare("INSERT INTO grades (run_id, task_id, try, grader, pass, reason, step, ungraded) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    for (const v of verdicts) grade.run(runId, taskId, tryNumber, v.grader, v.pass ? 1 : 0, this.redact(v.reason), v.step, v.ungraded ? 1 : 0);
  }

  // Regrading: every try's grades and status replaced at once, or none.
  replaceGrades(runId: string, trials: { taskId: string; tryNumber: number; status: RecordedTrial["status"]; verdicts: Verdict[] }[]): void {
    this.transaction(() => {
      const status = this.db.prepare("UPDATE trials SET status = ? WHERE run_id = ? AND task_id = ? AND try = ?");
      const clear = this.db.prepare("DELETE FROM grades WHERE run_id = ? AND task_id = ? AND try = ?");
      for (const t of trials) {
        if (status.run(t.status, runId, t.taskId, t.tryNumber).changes !== 1) throw new Error(`Run ${runId} has no try ${t.taskId}#${t.tryNumber} to regrade.`);
        clear.run(runId, t.taskId, t.tryNumber);
        this.insertGrades(runId, t.taskId, t.tryNumber, t.verdicts);
      }
    });
  }

  loadTrials(runId: string): RecordedTrial[] {
    const rows = this.db.prepare("SELECT * FROM trials WHERE run_id = ? ORDER BY task_id, try").all(runId).map((r) => trialRowSchema.parse(r));
    const stepsOf = this.db.prepare("SELECT payload_json FROM steps WHERE run_id = ? AND task_id = ? AND try = ? ORDER BY seq");
    const gradesOf = this.db.prepare("SELECT grader, pass, reason, step, ungraded FROM grades WHERE run_id = ? AND task_id = ? AND try = ? ORDER BY rowid");
    const payloads = z.array(z.object({ payload_json: z.string() }));
    const grades = z.array(z.object({ grader: z.string(), pass: z.number(), reason: z.string(), step: z.number().nullable(), ungraded: z.number() }));
    return rows.map((r) => {
      const args: SQLInputValue[] = [runId, r.task_id, r.try];
      return recordedTrialSchema.parse({
        taskId: r.task_id,
        category: r.category,
        tryNumber: r.try,
        status: r.status,
        end: r.end_reason,
        error: r.error,
        verdicts: grades.parse(gradesOf.all(...args)).map((g) => verdictSchema.parse({ grader: g.grader, pass: g.pass === 1, reason: g.reason, step: g.step, ungraded: g.ungraded === 1 })),
        calls: r.calls,
        cachedCalls: r.cached_calls,
        usage: { inputTokens: r.input_tokens, cachedInputTokens: r.cached_input_tokens, outputTokens: r.output_tokens },
        costUsd: r.cost_usd,
        modelLatencyMs: r.model_latency_ms,
        startedAt: r.started_at,
        finishedAt: r.finished_at,
        traceUrl: r.trace_url,
        steps: payloads.parse(stepsOf.all(...args)).map((p) => stepSchema.parse(JSON.parse(p.payload_json))),
      });
    });
  }

  cacheGet(key: string): string | null {
    const row = z.object({ response_json: z.string() }).optional().parse(this.db.prepare("SELECT response_json FROM cache WHERE key = ?").get(key));
    return row?.response_json ?? null;
  }

  cachePut(key: string, json: string, at: string): void {
    this.db.prepare("INSERT OR REPLACE INTO cache (key, created_at, response_json) VALUES (?, ?, ?)").run(key, at, this.redact(json));
  }

  recordProviderCall(call: { at: number; provider: string; model: string; inputTokens: number; cachedInputTokens: number; outputTokens: number }): void {
    this.db
      .prepare("INSERT INTO provider_calls (at, provider, model, input_tokens, cached_input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?, ?)")
      .run(call.at, call.provider, call.model, call.inputTokens, call.cachedInputTokens, call.outputTokens);
  }

  // Calls sent to one provider since `sinceMs`, and their tokens.
  usageSince(provider: string, sinceMs: number): ProviderUsage {
    const row = usageRowSchema.parse(
      this.db
        .prepare(
          `SELECT COUNT(*) AS calls, SUM(input_tokens) AS input, SUM(cached_input_tokens) AS cached, SUM(output_tokens) AS output
           FROM provider_calls WHERE provider = ? AND at >= ?`,
        )
        .get(provider, sinceMs),
    );
    return { calls: row.calls, inputTokens: row.input ?? 0, cachedInputTokens: row.cached ?? 0, outputTokens: row.output ?? 0 };
  }

  // Each call sent since `sinceMs` and its counted tokens, so a new pacer
  // starts from what the provider still remembers.
  recentCalls(provider: string, sinceMs: number): { at: number; tokens: number }[] {
    return z
      .array(z.object({ at: z.number(), tokens: z.number() }))
      .parse(
        this.db
          .prepare("SELECT at, input_tokens - cached_input_tokens + output_tokens AS tokens FROM provider_calls WHERE provider = ? AND at >= ? ORDER BY at")
          .all(provider, sinceMs),
      );
  }

  // From past runs, for the budget line. Null until there's enough history.
  averageCallsPerTry(): number | null {
    const row = averageRowSchema.parse(this.db.prepare("SELECT COUNT(*) AS n, AVG(calls) AS average FROM trials WHERE status != 'errored'").get());
    return row.n >= 10 ? row.average : null;
  }

  // Every provider's calls together: the pool is one model, so a call is
  // much the same size whichever answers it.
  averageUsagePerCall(): ProviderUsage | null {
    const row = z
      .object({ n: z.number(), input: z.number().nullable(), cached: z.number().nullable(), output: z.number().nullable() })
      .parse(
        this.db
          .prepare("SELECT COUNT(*) AS n, AVG(input_tokens) AS input, AVG(cached_input_tokens) AS cached, AVG(output_tokens) AS output FROM provider_calls")
          .get(),
      );
    if (row.n < 20) return null;
    return { calls: 1, inputTokens: row.input ?? 0, cachedInputTokens: row.cached ?? 0, outputTokens: row.output ?? 0 };
  }
}

export const tryKey = (taskId: string, tryNumber: number): string => `${taskId}#${tryNumber}`;
