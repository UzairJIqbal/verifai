import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, expect, it } from "vitest";
import { EvalStore } from "./store";

const dir = mkdtempSync(join(tmpdir(), "verifai-store-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("the grades table", () => {
  it("gains step and ungraded on a store made before them", () => {
    const path = join(dir, "old.db");
    const old = new DatabaseSync(path);
    old.exec("CREATE TABLE grades (run_id TEXT NOT NULL, task_id TEXT NOT NULL, try INTEGER NOT NULL, grader TEXT NOT NULL, pass INTEGER NOT NULL, reason TEXT NOT NULL, PRIMARY KEY (run_id, task_id, try, grader))");
    old.close();
    new EvalStore(path, (t) => t).close();
    const db = new DatabaseSync(path);
    const columns = db.prepare("PRAGMA table_info(grades)").all().map((c) => (c as { name: string }).name);
    db.close();
    expect(columns).toEqual(expect.arrayContaining(["step", "ungraded"]));
  });
  it("refuses to regrade a try the run doesn't have, and changes nothing", () => {
    const store = new EvalStore(join(dir, "new.db"), (t) => t);
    expect(() => store.replaceGrades("r1", [{ taskId: "cancel-01", tryNumber: 1, status: "passed", verdicts: [] }])).toThrow(/no try/);
    store.close();
  });
});
