// Every grader, in the order they're reported. Only the outcome graders (state
// and reply) decide whether a try passed; the rest are reported beside them,
// so a reader can see how a try got to its result.
import type { Trajectory, Verdict } from "../eval/trajectory";
import type { Task } from "../tasks/schema";
import { gradeArguments } from "./arguments";
import { EFFICIENCY, gradeEfficiency, gradeLoop, LOOP } from "./efficiency";
import { gradePolicy, POLICY_RULES } from "./policy";
import { gradeReply } from "./reply";
import { gradeState } from "./state";
import type { ShopFacts } from "./steps";
import { gradeToolChoice } from "./tool-choice";

export const OUTCOME_GRADERS = ["state", "reply"] as const;
export const GRADERS = [...OUTCOME_GRADERS, "tool-choice", "arguments", ...POLICY_RULES, EFFICIENCY, LOOP] as const;

export function gradeTry(task: Task, trajectory: Trajectory, shop: ShopFacts): Verdict[] {
  const verdicts = [
    gradeState(task, trajectory),
    gradeReply(task, trajectory),
    gradeToolChoice(task, trajectory),
    gradeArguments(trajectory, shop),
    ...gradePolicy(trajectory, shop),
    gradeEfficiency(task, trajectory),
    gradeLoop(trajectory),
  ];
  // A grader left out by mistake would read as "nothing wrong".
  const names = verdicts.map((v) => v.grader);
  if (names.join() !== GRADERS.join()) throw new Error(`The graders returned ${names.join(", ")}; expected ${GRADERS.join(", ")}.`);
  return verdicts;
}

// A try passes when every outcome grader ran and passed. Nothing else counts.
export function outcomePassed(verdicts: Verdict[]): boolean {
  return OUTCOME_GRADERS.every((name) => verdicts.some((v) => v.grader === name && v.pass && !v.ungraded));
}
