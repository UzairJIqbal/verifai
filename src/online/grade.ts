// Grading without an answer key: online there's no expected outcome, so only
// the graders that read the trajectory alone run. No state or reply grader.
import type { Trajectory, ValueSpan, Verdict } from "../eval/trajectory";
import { gradeArguments } from "../graders/arguments";
import { gradeLoop, LOOP } from "../graders/efficiency";
import { FABRICATED_ACTION, FABRICATED_ENTITY, gradeFabricatedActions, gradeFabricatedEntities } from "../graders/hallucination";
import { gradePolicy, POLICY_RULES } from "../graders/policy";
import type { ShopFacts } from "../graders/steps";
import type { ClaimCheck } from "../results/schema";

export const TOOL_ERRORS = "arguments";
export const ONLINE_GRADERS = [TOOL_ERRORS, ...POLICY_RULES, LOOP, FABRICATED_ENTITY, FABRICATED_ACTION] as const;

export function gradeOnline(trajectory: Trajectory, shop: ShopFacts, policy: string): (Verdict & { spans: ValueSpan[] })[] {
  const verdicts = [
    gradeArguments(trajectory, shop),
    ...gradePolicy(trajectory, shop),
    gradeLoop(trajectory),
    gradeFabricatedEntities(trajectory, { policy, today: shop.today }),
    gradeFabricatedActions(trajectory),
  ];
  // A grader left out by mistake would read as "nothing wrong".
  const names = verdicts.map((v) => v.grader);
  if (names.join() !== ONLINE_GRADERS.join()) throw new Error(`The online graders returned ${names.join(", ")}; expected ${ONLINE_GRADERS.join(", ")}.`);
  return verdicts.map((v) => ({ ...v, spans: v.spans ?? [] }));
}

const isPolicy = (grader: string): boolean => (POLICY_RULES as readonly string[]).includes(grader);
const FLAGGING = new Set<string>([...POLICY_RULES, FABRICATED_ENTITY, FABRICATED_ACTION]);

// Why a graded conversation goes to the review queue, one line each; empty
// when it doesn't. A grader or claim check that couldn't run flags it too: a
// grader that can't run fails loudly, never passes. A claim check that's
// missing because the checker stopped (null) is counted apart, not flagged.
export function flagReasons(verdicts: Verdict[], claims: ClaimCheck | null): string[] {
  const out: string[] = [];
  for (const v of verdicts) {
    if (!FLAGGING.has(v.grader) || v.pass) continue;
    const what = isPolicy(v.grader) ? `policy: ${v.grader}` : v.grader;
    // An ungraded verdict's reason already starts "couldn't grade".
    out.push(`${what}: ${v.reason}`);
  }
  if (claims?.status === "ungraded") out.push(`claims: couldn't grade: ${claims.reason}`);
  if (claims?.status === "checked") {
    for (const c of claims.claims) if (c.label !== "supported") out.push(`${c.label} claim: "${c.text}" (${c.reason})`);
  }
  return out;
}
