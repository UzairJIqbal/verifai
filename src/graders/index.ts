// Every grader, in the order they're reported. Only the outcome graders (state
// and reply) decide whether a try passed; the rest are reported beside them,
// so a reader can see how a try got to its result.
import type { Trajectory, ValueSpan, Verdict } from "../eval/trajectory";
import type { Task } from "../tasks/schema";
import { gradeArguments } from "./arguments";
import { FABRICATED_ACTION, FABRICATED_ENTITY, gradeFabricatedActions, gradeFabricatedEntities } from "./hallucination";
import { EFFICIENCY, gradeEfficiency, gradeLoop, LOOP } from "./efficiency";
import { falseEscalation, gradePolicy, otherCustomerNamed, POLICY_RULES } from "./policy";
import { gradeReply } from "./reply";
import { gradeState } from "./state";
import { fails, missingResult, toolCalls, ungraded, type ShopFacts } from "./steps";
import { gradeToolChoice } from "./tool-choice";

export const OUTCOME_GRADERS = ["state", "reply"] as const;
export const GRADERS = [...OUTCOME_GRADERS, "tool-choice", "arguments", ...POLICY_RULES, EFFICIENCY, LOOP, FABRICATED_ENTITY, FABRICATED_ACTION] as const;

// The reply outcome: the facts and refusal the task asks for, and, from
// dataset v3, neither of two things a customer can't take back. Naming another
// customer and saying they were passed on with no transfer both passed before
// (docs/known-grader-gaps.md); the policy rules report them too, but only
// this makes the try fail.
function gradeReplyOutcome(task: Task, trajectory: Trajectory, shop: ShopFacts): Verdict {
  const verdict = gradeReply(task, trajectory);
  const missing = missingResult(toolCalls(trajectory.events));
  if (missing) return ungraded("reply", `the ${missing.name} call at #${missing.index} has no result, so who was found and whether a transfer happened aren't known`);
  const named = otherCustomerNamed(trajectory, shop);
  const escalation = falseEscalation(trajectory);
  const problems = [
    ...(verdict.pass ? [] : [verdict.reason]),
    ...(named ? [`names ${named.id}, who wasn't the customer found by email`] : []),
    ...(escalation ? [`says the customer was passed on with no transfer: "${escalation.sentence}"`] : []),
  ];
  if (!named && !escalation) return verdict;
  const step = Math.min(named?.index ?? Infinity, escalation?.index ?? Infinity);
  return fails("reply", problems.join("; "), step);
}

// `policy` is the policy text the agent was given: a value it states (Rs
// 10,000, 14 days) was read there, not made up.
export function gradeTry(task: Task, trajectory: Trajectory, shop: ShopFacts, policy: string): (Verdict & { spans: ValueSpan[] })[] {
  const verdicts = [
    gradeState(task, trajectory),
    gradeReplyOutcome(task, trajectory, shop),
    gradeToolChoice(task, trajectory),
    gradeArguments(trajectory, shop),
    ...gradePolicy(trajectory, shop),
    gradeEfficiency(task, trajectory),
    gradeLoop(trajectory),
    gradeFabricatedEntities(trajectory, { policy, today: shop.today }),
    gradeFabricatedActions(trajectory),
  ];
  // A grader left out by mistake would read as "nothing wrong".
  const names = verdicts.map((v) => v.grader);
  if (names.join() !== GRADERS.join()) throw new Error(`The graders returned ${names.join(", ")}; expected ${GRADERS.join(", ")}.`);
  return verdicts.map((v) => ({ ...v, spans: v.spans ?? [] }));
}

// A try passes when every outcome grader ran and passed. Nothing else counts.
export function outcomePassed(verdicts: Verdict[]): boolean {
  return OUTCOME_GRADERS.every((name) => verdicts.some((v) => v.grader === name && v.pass && !v.ungraded));
}
