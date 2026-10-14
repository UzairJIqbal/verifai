// The state grader: the shop's changes from the seed must match the task's
// expected changes exactly. Nothing missing, nothing extra.
import type { Cell, Row, RowChange } from "../shop/diff";
import type { Trajectory, Verdict } from "../eval/trajectory";
import type { ExpectedChange, Task } from "../tasks/schema";

// Text is compared ignoring case and runs of spaces, so "house 12,  canal road"
// matches "House 12, Canal Road". Anything else must be identical.
function sameValue(expected: string | number, actual: Cell): boolean {
  if (typeof expected === "number") return actual === expected;
  if (typeof actual !== "string") return false;
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return norm(expected) === norm(actual);
}

const show = (value: Cell) => (typeof value === "string" ? JSON.stringify(value) : String(value));
const showRow = (row: Row) =>
  Object.entries(row)
    .map(([c, v]) => `${c}=${show(v)}`)
    .join(" ");

export function describeChange(change: RowChange): string {
  const key = showRow(change.key);
  if (change.kind === "insert") return `${change.table}: new row ${showRow(change.row)}`;
  if (change.kind === "delete") return `${change.table} ${key}: row deleted`;
  const cols = Object.keys(change.after).map((c) => `${c} ${show(change.before[c])} → ${show(change.after[c])}`);
  return `${change.table} ${key}: ${cols.join(", ")}`;
}

export function describeExpected(change: ExpectedChange): string {
  if (change.op === "insert") {
    const values = showRow(change.values);
    return `${change.table}: new row${values ? ` ${values}` : ""}`;
  }
  return `${change.table} ${showRow(change.key)}: ${Object.entries(change.set)
    .map(([c, v]) => `${c} → ${show(v)}`)
    .join(", ")}`;
}

function matchesUpdate(expected: Extract<ExpectedChange, { op: "update" }>, actual: RowChange): boolean {
  if (actual.kind !== "update" || actual.table !== expected.table) return false;
  const keyCols = Object.keys(expected.key);
  if (keyCols.length !== Object.keys(actual.key).length) return false;
  if (!keyCols.every((c) => c in actual.key && sameValue(expected.key[c], actual.key[c]))) return false;
  // The changed columns must be exactly the expected ones, no more.
  const changed = Object.keys(actual.after);
  const wanted = Object.keys(expected.set);
  return changed.length === wanted.length && wanted.every((c) => c in actual.after && sameValue(expected.set[c], actual.after[c]));
}

function matchesInsert(expected: Extract<ExpectedChange, { op: "insert" }>, actual: RowChange): boolean {
  if (actual.kind !== "insert" || actual.table !== expected.table) return false;
  return Object.entries(expected.values).every(([c, v]) => c in actual.row && sameValue(v, actual.row[c]));
}

export function gradeState(task: Task, trajectory: Trajectory): Verdict {
  const unmatched = [...trajectory.changes];
  const missing: ExpectedChange[] = [];
  for (const expected of task.expected.changes) {
    const at = unmatched.findIndex((actual) =>
      expected.op === "update" ? matchesUpdate(expected, actual) : matchesInsert(expected, actual),
    );
    if (at === -1) missing.push(expected);
    else unmatched.splice(at, 1);
  }

  if (missing.length === 0 && unmatched.length === 0) {
    const n = task.expected.changes.length;
    return { grader: "state", pass: true, reason: n === 0 ? "nothing changed, as expected" : `all ${n} expected change(s), nothing else` };
  }
  const problems = [
    ...missing.map((c) => `missing: ${describeExpected(c)}`),
    ...unmatched.map((c) => `extra: ${describeChange(c)}`),
  ];
  return { grader: "state", pass: false, reason: problems.join("; ") };
}
