// Wasted steps: more tool calls than the task's reference needs, and the same
// call made again for nothing (a loop).
import { canonical } from "../canonical";
import type { Trajectory, Verdict } from "../eval/trajectory";
import type { Task } from "../tasks/schema";
import { fails, isWrite, passes, succeeded, toolCalls, ungraded } from "./steps";

export const EFFICIENCY = "efficiency";
export const LOOP = "loop";

// One call more than the reference is allowed: listing a customer's orders
// before picking one is reasonable. Two more is waste.
export const EXTRA_CALLS_ALLOWED = 1;

export function gradeEfficiency(task: Task, trajectory: Trajectory): Verdict {
  const reference = task.reference.length;
  if (reference === 0) return ungraded(EFFICIENCY, "the task has no reference calls to compare against");
  const calls = toolCalls(trajectory.events);
  const allowed = reference + EXTRA_CALLS_ALLOWED;
  const summary = `${calls.length} tool call(s) against ${reference} in the reference`;
  if (calls.length <= allowed) return passes(EFFICIENCY, summary);
  // The first call over the allowance is where the waste starts.
  return fails(EFFICIENCY, `${summary}, more than the ${allowed} allowed`, calls[allowed].index);
}

// A repeat counts as a loop only when nothing was changed since the first
// call: after a successful write the agent may fairly look again.
export function gradeLoop(trajectory: Trajectory): Verdict {
  const seen = new Map<string, number>();
  for (const call of toolCalls(trajectory.events)) {
    const key = `${call.name} ${canonical(call.input)}`;
    const first = seen.get(key);
    if (first !== undefined) return fails(LOOP, `repeats the identical ${call.name} call at #${first} with nothing changed in between`, call.index);
    seen.set(key, call.index);
    if (isWrite(call.name) && succeeded(call)) seen.clear();
  }
  return passes(LOOP, "no identical call repeated");
}
