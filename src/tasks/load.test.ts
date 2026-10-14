import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { writeShop } from "../shop/seed";
import { gradeState } from "../graders/state";
import { runReference } from "../eval/conversation";
import { freezeHoldout, loadTasks, TASK_FILES, type TaskFiles } from "./load";

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
    expect(readFileSync(files.changelog, "utf8")).toContain("2026-01-01 · v1 · holdout frozen");
  });

  it("refuses a task whose expected changes don't match its reference", () => {
    const all = lines();
    const n = all.findIndex((l) => l.includes('"cancel_order"')) + 1;
    all[n - 1] = all[n - 1].replace('"cancelled"', '"shipped"');
    writeLines(all);
    expect(() => freezeHoldout("test", { files, seedPath })).toThrow(/Not frozen/);
  });
});
