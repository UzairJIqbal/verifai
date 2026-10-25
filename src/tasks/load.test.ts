import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { writeShop } from "../shop/seed";
import { gradeState } from "../graders/state";
import { runReference } from "../eval/conversation";
import { addDevTask, addTasks, freezeHoldout, loadTasks, nextTaskId, TASK_FILES, type TaskFiles } from "./load";
import { makeDraft, readDraft, writeDraft } from "./draft";
import { readdirSync, statSync } from "node:fs";

const dir = mkdtempSync(join(tmpdir(), "verifai-tasks-test-"));
const seedPath = join(dir, "shop.db");
writeShop(seedPath);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const files: TaskFiles = { tasks: join(dir, "tasks.jsonl"), lock: join(dir, "holdout.lock.json"), changelog: join(dir, "CHANGELOG.md") };
const lines = () => readFileSync(files.tasks, "utf8").split("\n");
const writeLines = (all: string[]) => writeFileSync(files.tasks, all.join("\n"));
// The line number of the first task in the given split.
const firstLine = (split: string) => lines().findIndex((l) => l.includes(`"split": "${split}"`) || l.includes(`"split":"${split}"`)) + 1;

beforeEach(() => {
  copyFileSync(TASK_FILES.tasks, files.tasks);
  copyFileSync(TASK_FILES.lock, files.lock);
  rmSync(files.changelog, { force: true });
});

describe("the real tasks file", () => {
  it("loads, with the holdout matching its lock", () => {
    const { version, tasks, holdoutCounts } = loadTasks();
    expect(version).toMatch(/^v\d+$/);
    expect(tasks.length).toBeGreaterThan(0);
    expect(Object.values(holdoutCounts).every((n) => n > 0)).toBe(true);
  });

  it("gives every dev task expected changes its reference calls produce", () => {
    for (const task of loadTasks().tasks) {
      const { trajectory, errors } = runReference(task, seedPath);
      expect(errors, task.id).toEqual([]);
      expect(gradeState(task, trajectory), task.id).toMatchObject({ pass: true });
    }
  });
});

describe("loadTasks", () => {
  it("returns only dev tasks unless gating", () => {
    expect(loadTasks({ files }).tasks.every((t) => t.split === "dev")).toBe(true);
    expect(loadTasks({ files, gating: true }).tasks.every((t) => t.split === "holdout")).toBe(true);
  });

  it("names the line with broken JSON", () => {
    const all = lines();
    all[6] = all[6].slice(0, -1);
    writeLines(all);
    expect(() => loadTasks({ files })).toThrow(/tasks\.jsonl line 7 isn't valid JSON/);
  });

  it("names the line that isn't a valid task", () => {
    const all = lines();
    all[3] = all[3].replace(/"difficulty": ?"\w+"/, '"difficulty": "medium"');
    writeLines(all);
    expect(() => loadTasks({ files })).toThrow(/line 4 isn't a valid task/);
  });

  it("refuses when a holdout task changes, and runs again once it's undone", () => {
    const original = lines();
    const n = firstLine("holdout");
    const changed = [...original];
    changed[n - 1] = changed[n - 1].replace(/Please|please|order/, "kindly");
    expect(changed[n - 1]).not.toBe(original[n - 1]);
    writeLines(changed);
    expect(() => loadTasks({ files })).toThrow(/no longer match their frozen fingerprint/);
    writeLines(original);
    expect(() => loadTasks({ files })).not.toThrow();
  });

  it("doesn't mind a dev task changing", () => {
    const all = lines();
    const n = firstLine("dev");
    all[n - 1] = all[n - 1].replace(/"note": ?"/, '"note": "Edited. ');
    writeLines(all);
    expect(() => loadTasks({ files })).not.toThrow();
  });
});

describe("freezeHoldout", () => {
  it("accepts a changed holdout only through a deliberate re-freeze with a reason", () => {
    const all = lines();
    const n = firstLine("holdout");
    all[n - 1] = all[n - 1].replace(/"note": ?"/, '"note": "Edited. ');
    writeLines(all);
    expect(() => loadTasks({ files })).toThrow();
    expect(() => freezeHoldout(" ", { files, seedPath })).toThrow(/Say why/);
    freezeHoldout("test re-freeze", { files, seedPath, now: new Date("2026-01-01T00:00:00Z") });
    expect(() => loadTasks({ files })).not.toThrow();
    const { version } = loadTasks({ files });
    expect(readFileSync(files.changelog, "utf8")).toContain(`2026-01-01 · ${version} · holdout frozen`);
  });

  it("refuses a task whose expected changes don't match its reference", () => {
    const all = lines();
    const n = all.findIndex((l) => l.includes('"cancel_order"')) + 1;
    all[n - 1] = all[n - 1].replace('"cancelled"', '"shipped"');
    writeLines(all);
    expect(() => freezeHoldout("test", { files, seedPath })).toThrow(/Not frozen/);
  });
});

describe("regression tasks", () => {
  const from = { runId: "r1", taskId: "cancel-01", tryNumber: 2, datasetVersion: "v2", failureCategory: "wrong-tool", reviewNote: "cancelled the wrong order" };

  it("go to dev only, bump the dataset version and leave the holdout lock alone", () => {
    const before = loadTasks({ files });
    const source = before.tasks.find((t) => t.category === "cancel");
    if (!source) throw new Error("no dev cancel task");
    const id = nextTaskId("cancel", files);
    const task = { ...source, id, first_message: `${source.first_message} Thanks!`, note: "Same cancel, asked differently." };
    const lock = readFileSync(files.lock, "utf8");
    expect(() => addDevTask({ ...task, split: "holdout" }, "x", { files, seedPath })).toThrow(/goes to dev/);
    expect(() => addDevTask({ ...task, id: source.id }, "x", { files, seedPath })).toThrow(/already a task/);
    const { version } = addDevTask(task, "test add", { files, seedPath, now: new Date("2026-01-02T00:00:00Z") });
    const after = loadTasks({ files });
    expect(version).toBe(`v${Number(before.version.slice(1)) + 1}`);
    expect(after.version).toBe(version);
    expect(after.tasks.map((t) => t.id)).toContain(id);
    expect(after.holdoutCounts).toEqual(before.holdoutCounts);
    expect(readFileSync(files.lock, "utf8")).toBe(lock);
    expect(readFileSync(files.changelog, "utf8")).toContain(`2026-01-02 · ${version} · dev task ${id} added`);
  });

  it("put the dataset back when the changelog line can't be written", () => {
    const source = loadTasks({ files }).tasks.find((t) => t.category === "cancel");
    if (!source) throw new Error("no dev cancel task");
    const tasksBefore = readFileSync(files.tasks, "utf8");
    // A directory where the changelog should be: appending to it fails.
    const broken = { ...files, changelog: mkdtempSync(join(tmpdir(), "verifai-changelog-")) };
    const task = { ...source, id: nextTaskId("cancel", files), first_message: `${source.first_message} Please.` };
    expect(() => addDevTask(task, "x", { files: broken, seedPath })).toThrow(/Not added: the tasks changelog/);
    expect(readFileSync(files.tasks, "utf8")).toBe(tasksBefore);
    rmSync(broken.changelog, { recursive: true, force: true });
  });

  it("skip ids held by drafts not yet added", () => {
    const first = nextTaskId("cancel", files);
    const n = Number(first.slice("cancel-".length));
    const id = (k: number) => `cancel-${String(k).padStart(2, "0")}`;
    expect(nextTaskId("cancel", files, [first, "refund-90"])).toBe(id(n + 1));
    expect(nextTaskId("cancel", files, [id(n + 4)])).toBe(id(n + 5));
  });

  it("refuse a task whose expected changes its reference calls don't produce", () => {
    const source = loadTasks({ files }).tasks.find((t) => t.expected.changes.length > 0);
    if (!source) throw new Error("no dev task with changes");
    expect(() => addDevTask({ ...source, id: nextTaskId(source.category, files), expected: { ...source.expected, changes: [] } }, "x", { files, seedPath })).toThrow(/Not added/);
  });

  it("start as an unfinished draft that can't be added until it's edited", () => {
    const drafts = join(dir, "drafts");
    const source = loadTasks({ files }).tasks.find((t) => t.id === "cancel-01");
    if (!source) throw new Error("no cancel-01");
    const draft = makeDraft(source, "cancel-90", from);
    writeDraft(draft, drafts);
    expect(() => writeDraft(draft, drafts)).toThrow(/already exists/);
    expect(() => readDraft("cancel-90", source, drafts)).toThrow(/EDIT ME/);
    writeFileSync(join(drafts, "cancel-90.json"), JSON.stringify({ ...draft, note: "Checks the cancel." }));
    expect(() => readDraft("cancel-90", source, drafts)).toThrow(/same first message/);
    writeFileSync(join(drafts, "cancel-90.json"), JSON.stringify({ ...draft, note: "Checks the cancel.", first_message: "Cancel 1005 please, esha.qureshi@example.com" }));
    const { task, from: back } = readDraft("cancel-90", source, drafts);
    expect(task).not.toHaveProperty("_from");
    expect(back).toEqual(from);
  });
});

describe("a new task set", () => {
  const sources = () => {
    const dev = loadTasks({ files }).tasks;
    const cancel = dev.find((t) => t.category === "cancel" && t.expected.changes.length > 0);
    const refund = dev.find((t) => t.category === "refund" && t.expected.changes.length > 0);
    if (!cancel || !refund) throw new Error("no dev cancel or refund task with changes");
    return {
      dev: { ...cancel, id: nextTaskId("cancel", files), first_message: `${cancel.first_message} Thanks.` },
      holdout: { ...refund, id: nextTaskId("refund", files), split: "holdout" as const, first_message: `${refund.first_message} Thanks.` },
    };
  };

  it("goes in as one bump, re-freezing the holdout on purpose when it adds to it", () => {
    const before = loadTasks({ files });
    const lock = readFileSync(files.lock, "utf8");
    const { dev, holdout } = sources();
    const { version } = addTasks([dev, holdout], "fresh tasks", { files, seedPath, now: new Date("2026-01-03T00:00:00Z") });
    const after = loadTasks({ files });
    expect(version).toBe(`v${Number(before.version.slice(1)) + 1}`);
    expect(after.version).toBe(version);
    expect(after.tasks.map((t) => t.id)).toContain(dev.id);
    expect(after.tasks.map((t) => t.id)).not.toContain(holdout.id);
    expect(after.holdoutCounts.refund).toBe(before.holdoutCounts.refund + 1);
    expect(loadTasks({ files, gating: true }).tasks.map((t) => t.id)).toContain(holdout.id);
    expect(readFileSync(files.lock, "utf8")).not.toBe(lock);
    expect(readFileSync(files.changelog, "utf8")).toMatch(
      new RegExp(`2026-01-03 · ${version} · 2 tasks added \\(dev ${dev.id}; holdout ${holdout.id}\\); holdout re-frozen .* fresh tasks`),
    );
  });

  it("adds nothing when one of them is wrong", () => {
    const tasksBefore = readFileSync(files.tasks, "utf8");
    const lock = readFileSync(files.lock, "utf8");
    const { dev, holdout } = sources();
    expect(() => addTasks([dev, { ...holdout, expected: { ...holdout.expected, changes: [] } }], "x", { files, seedPath })).toThrow(/Not added. refund-/);
    expect(() => addTasks([dev, { ...dev }], "x", { files, seedPath })).toThrow(/already a task/);
    expect(() => addTasks([dev], " ", { files, seedPath })).toThrow(/Say why/);
    expect(readFileSync(files.tasks, "utf8")).toBe(tasksBefore);
    expect(readFileSync(files.lock, "utf8")).toBe(lock);
  });
});

// The gate is the only caller allowed to ask for holdout tasks.
describe("holdout access", () => {
  const root = join(__dirname, "../..");
  const files = (d: string): string[] =>
    readdirSync(d).flatMap((f) => {
      const p = join(d, f);
      if (statSync(p).isDirectory()) return f === "node_modules" || f.startsWith(".") ? [] : files(p);
      return /\.(ts|tsx)$/.test(f) ? [p] : [];
    });

  it("asks for holdout tasks only in scripts/gate.ts (and the loader's own tests)", () => {
    const callers = ["src", "scripts", "app"]
      .flatMap((d) => files(join(root, d)))
      .filter((p) => /gating:\s*true/.test(readFileSync(p, "utf8")))
      .map((p) => p.slice(root.length + 1))
      .sort();
    expect(callers).toEqual(["scripts/gate.ts", "src/tasks/load.test.ts"]);
  });
});
