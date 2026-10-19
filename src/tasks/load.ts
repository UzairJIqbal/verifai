// The only code that reads the tasks file. It validates every line, checks the
// holdout against its frozen fingerprint, and hands out dev tasks unless the
// caller says it's gating.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { z } from "zod";
import { canonical } from "../canonical";
import { PROJECT_ROOT } from "../config";
import { gradeState } from "../graders/state";
import { runReference } from "../eval/conversation";
import { taskFileHeaderSchema, taskSchema, type Category, type Task } from "./schema";

export type TaskFiles = { tasks: string; lock: string; changelog: string };

const EVALS_DIR = join(PROJECT_ROOT, "evals");
export const TASK_FILES: TaskFiles = {
  tasks: join(EVALS_DIR, "tasks.jsonl"),
  lock: join(EVALS_DIR, "holdout.lock.json"),
  changelog: join(EVALS_DIR, "CHANGELOG.md"),
};

const lockSchema = z.strictObject({
  dataset_version: z.string(),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  holdout_count: z.number().int().nonnegative(),
  frozen_at: z.string(),
});

export type HoldoutCounts = Record<Category, number>;

export type LoadedTasks = {
  version: string;
  tasks: Task[];
  // How many holdout tasks each category has. Counts only: their content
  // never leaves the loader unless the caller is gating.
  holdoutCounts: HoldoutCounts;
};

const show = (path: string) => relative(PROJECT_ROOT, path) || path;

function readTaskFile(path: string): { version: string; tasks: Task[] } {
  // The file isn't part of any build trace: the tasks page prerenders from it.
  if (!existsSync(/*turbopackIgnore: true*/ path)) {
    throw new Error(`${show(path)} doesn't exist. It holds the tasks; restore it from git.`);
  }
  const lines = readFileSync(/*turbopackIgnore: true*/ path, "utf8").split("\n");
  const where = (n: number) => `${show(path)} line ${n}`;

  const parseLine = (n: number): unknown => {
    try {
      return JSON.parse(lines[n - 1]);
    } catch (error) {
      throw new Error(`${where(n)} isn't valid JSON (${error instanceof Error ? error.message : String(error)}). Fix that line and run again.`);
    }
  };

  // Line 1 says which dataset version this is.
  const header = taskFileHeaderSchema.safeParse(parseLine(1));
  if (!header.success) {
    throw new Error(`${where(1)} must be the header, like {"dataset_version":"v1"}: ${z.prettifyError(header.error)}`);
  }

  const tasks: Task[] = [];
  const seen = new Map<string, number>();
  for (let n = 2; n <= lines.length; n++) {
    if (lines[n - 1].trim() === "") continue;
    const parsed = taskSchema.safeParse(parseLine(n));
    if (!parsed.success) {
      throw new Error(`${where(n)} isn't a valid task:\n${z.prettifyError(parsed.error)}`);
    }
    const task = parsed.data;
    const earlier = seen.get(task.id);
    if (earlier !== undefined) throw new Error(`${where(n)} repeats the id ${task.id}, already used on line ${earlier}.`);
    if (!task.id.startsWith(`${task.category}-`)) {
      throw new Error(`${where(n)}: the id ${task.id} doesn't start with its category, ${task.category}.`);
    }
    seen.set(task.id, n);
    tasks.push(task);
  }
  return { version: header.data.dataset_version, tasks };
}

export function holdoutFingerprint(tasks: Task[]): string {
  const holdout = tasks.filter((t) => t.split === "holdout").sort((a, b) => (a.id < b.id ? -1 : 1));
  return createHash("sha256").update(canonical(holdout)).digest("hex");
}

function countHoldout(tasks: Task[]): HoldoutCounts {
  const counts: HoldoutCounts = { cancel: 0, refund: 0, address: 0, status: 0, transfer: 0 };
  for (const task of tasks) if (task.split === "holdout") counts[task.category]++;
  return counts;
}

const REFREEZE = "If the change was deliberate, re-freeze with `pnpm tasks:freeze --reason \"why\"`; otherwise undo it.";

function checkLock(files: TaskFiles, tasks: Task[]): void {
  if (!existsSync(/*turbopackIgnore: true*/ files.lock)) {
    throw new Error(`The holdout has never been frozen (${show(files.lock)} is missing). Run \`pnpm tasks:freeze --reason "why"\`.`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(/*turbopackIgnore: true*/ files.lock, "utf8"));
  } catch {
    throw new Error(`${show(files.lock)} isn't valid JSON. Restore it from git.`);
  }
  const lock = lockSchema.safeParse(raw);
  if (!lock.success) throw new Error(`${show(files.lock)} is malformed. Restore it from git.`);
  if (holdoutFingerprint(tasks) !== lock.data.fingerprint) {
    throw new Error(`The holdout tasks no longer match their frozen fingerprint: a holdout task was changed, added, removed or moved between splits. ${REFREEZE}`);
  }
}

/**
 * Dev tasks, unless `gating` is set, in which case only holdout tasks. Refuses
 * (throws) on any bad line or a holdout that doesn't match its lock.
 */
export function loadTasks(options: { gating?: true; files?: TaskFiles } = {}): LoadedTasks {
  const files = options.files ?? TASK_FILES;
  const { version, tasks } = readTaskFile(files.tasks);
  checkLock(files, tasks);
  const split = options.gating ? "holdout" : "dev";
  return { version, tasks: tasks.filter((t) => t.split === split), holdoutCounts: countHoldout(tasks) };
}

/**
 * Re-freezes the holdout: the deliberate step after changing it. Every task's
 * reference calls must produce exactly its expected changes first. Writes the
 * lock and a changelog line saying why.
 */
export function freezeHoldout(reason: string, options: { files?: TaskFiles; seedPath?: string; now?: Date } = {}): {
  version: string;
  fingerprint: string;
  holdoutCounts: HoldoutCounts;
} {
  if (reason.trim() === "") throw new Error("Say why the holdout is being frozen: --reason \"…\".");
  const files = options.files ?? TASK_FILES;
  const { version, tasks } = readTaskFile(files.tasks);

  const broken: string[] = [];
  for (const task of tasks) {
    const { trajectory, errors } = runReference(task, options.seedPath);
    const verdict = gradeState(task, trajectory);
    if (errors.length > 0) broken.push(`${task.id}: reference call failed: ${errors.join("; ")}`);
    else if (!verdict.pass) broken.push(`${task.id}: ${verdict.reason}`);
  }
  if (broken.length > 0) {
    throw new Error(`Not frozen. These tasks' expected changes don't match their reference calls:\n  ${broken.join("\n  ")}`);
  }

  const fingerprint = holdoutFingerprint(tasks);
  const holdoutCounts = countHoldout(tasks);
  const total = Object.values(holdoutCounts).reduce((a, b) => a + b, 0);
  const frozenAt = (options.now ?? new Date()).toISOString();
  const lock: z.infer<typeof lockSchema> = { dataset_version: version, fingerprint, holdout_count: total, frozen_at: frozenAt };
  writeFileSync(/*turbopackIgnore: true*/ files.lock, `${JSON.stringify(lock, null, 2)}\n`);
  const line = `- ${frozenAt.slice(0, 10)} · ${version} · holdout frozen (${total} of ${tasks.length} tasks, fingerprint ${fingerprint.slice(0, 12)}). ${reason.trim()}\n`;
  if (!existsSync(/*turbopackIgnore: true*/ files.changelog)) writeFileSync(/*turbopackIgnore: true*/ files.changelog, "# Tasks changelog\n\nEvery change to the holdout, and why.\n\n");
  appendFileSync(/*turbopackIgnore: true*/ files.changelog, line);
  return { version, fingerprint, holdoutCounts };
}

// The next dataset version: v2 → v3.
export const nextDatasetVersion = (version: string): string => {
  const m = /^v(\d+)$/.exec(version);
  if (!m) throw new Error(`The dataset version ${version} isn't like v2.`);
  return `v${Number(m[1]) + 1}`;
};

// A free id in the category: one past the highest used on either split or
// held by a draft not yet added (`reserved`).
export function nextTaskId(category: Category, files: TaskFiles = TASK_FILES, reserved: string[] = []): string {
  const used = [...readTaskFile(files.tasks).tasks.map((t) => t.id), ...reserved]
    .filter((id) => id.startsWith(`${category}-`))
    .map((id) => Number(id.slice(category.length + 1)));
  const id = Math.max(0, ...used) + 1;
  if (id > 99) throw new Error(`${category} has no ids left (ids are two digits).`);
  return `${category}-${String(id).padStart(2, "0")}`;
}

/**
 * Adds a regression task to dev and bumps the dataset version, since scores on
 * different task sets aren't comparable. The task's reference calls must
 * produce exactly its expected changes. Holdout is never touched, so its lock
 * stays as it is; the changelog line says what was added and why.
 */
export function addDevTask(task: Task, reason: string, options: { files?: TaskFiles; seedPath?: string; now?: Date } = {}): { version: string } {
  if (reason.trim() === "") throw new Error("Say why the task is being added.");
  if (task.split !== "dev") throw new Error("A regression task goes to dev. Holdout tasks change only by re-freezing on purpose.");
  if (!task.id.startsWith(`${task.category}-`)) throw new Error(`The id ${task.id} doesn't start with its category, ${task.category}.`);
  const files = options.files ?? TASK_FILES;
  const { version, tasks } = readTaskFile(files.tasks);
  checkLock(files, tasks);
  if (tasks.some((t) => t.id === task.id)) throw new Error(`${task.id} is already a task. Pick a free id.`);

  const { trajectory, errors } = runReference(task, options.seedPath);
  if (errors.length > 0) throw new Error(`Not added. A reference call failed: ${errors.join("; ")}`);
  const verdict = gradeState(task, trajectory);
  if (!verdict.pass) throw new Error(`Not added. Its expected changes don't match its reference calls: ${verdict.reason}`);

  const next = nextDatasetVersion(version);
  const before = readFileSync(/*turbopackIgnore: true*/ files.tasks, "utf8");
  const lines = before.split("\n").filter((l, i) => i > 0 && l.trim() !== "");
  // Written beside it, then renamed over it: a crash halfway leaves the old
  // file whole, never a cut-off one.
  const replaceTasks = (text: string) => {
    const temp = `${files.tasks}.tmp`;
    writeFileSync(/*turbopackIgnore: true*/ temp, text);
    renameSync(/*turbopackIgnore: true*/ temp, files.tasks);
  };
  replaceTasks([JSON.stringify({ dataset_version: next }), ...lines, JSON.stringify(taskSchema.parse(task))].join("\n") + "\n");
  const day = (options.now ?? new Date()).toISOString().slice(0, 10);
  // The task and its changelog line go in together: if the line can't be
  // written, the old dataset is put back and nothing was added.
  try {
    if (!existsSync(/*turbopackIgnore: true*/ files.changelog)) writeFileSync(/*turbopackIgnore: true*/ files.changelog, "# Tasks changelog\n\nEvery change to the holdout, and why.\n\n");
    appendFileSync(/*turbopackIgnore: true*/ files.changelog, `- ${day} · ${next} · dev task ${task.id} added (holdout unchanged). ${reason.trim()} Scores from ${version} and ${next} are not comparable.\n`);
  } catch (error) {
    replaceTasks(before);
    throw new Error(`Not added: the tasks changelog couldn't be written (${error instanceof Error ? error.message : String(error)}). The dataset is back to ${version}.`);
  }
  return { version: next };
}
