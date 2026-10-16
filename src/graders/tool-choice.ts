// The tool-choice grader: the tools the agent changed things with, against the
// task's reference. A write tool in the reference must be called; any other
// write tool must not.
import type { Trajectory, Verdict } from "../eval/trajectory";
import type { Task } from "../tasks/schema";
import { fails, isWrite, passes, toolCalls, ungraded } from "./steps";

export const GRADER = "tool-choice";

// Every tool in the reference. The per-tool precision and recall table counts
// all seven tools against this; the pass or fail below looks at writes only.
export const expectedTools = (task: Task): string[] => [...new Set(task.reference.map((c) => c.tool))].sort();

// Read tools are left out of pass or fail on purpose: the reference is one
// good path, and reaching the same facts another way (listing the orders
// instead of getting one, or skipping the list when the customer gave the
// number) isn't a wrong tool. Whether the reads came first is what
// identify-first and look-up-first check. How many times a tool is called is
// efficiency's business.
export function gradeToolChoice(task: Task, trajectory: Trajectory): Verdict {
  if (task.reference.length === 0) return ungraded(GRADER, "the task has no reference calls, so there's no list of tools to check against");
  const expected = new Set(expectedTools(task).filter(isWrite));
  const calls = toolCalls(trajectory.events).filter((c) => isWrite(c.name));
  const called = new Set(calls.map((c) => c.name));
  const missing = [...expected].filter((t) => !called.has(t));
  const extra = [...called].filter((t) => !expected.has(t));
  if (missing.length === 0 && extra.length === 0) {
    return passes(GRADER, expected.size === 0 ? "changed nothing, and the task needs no change" : `changed things with exactly the ${expected.size} expected tool(s)`);
  }
  const problems = [...(missing.length > 0 ? [`never called ${missing.join(", ")}`] : []), ...(extra.length > 0 ? [`called ${extra.join(", ")}, which the task doesn't need`] : [])];
  // An extra call is a step to point at; a missing one isn't anywhere.
  const firstExtra = calls.find((c) => !expected.has(c.name));
  return fails(GRADER, problems.join("; "), firstExtra?.index ?? null);
}
