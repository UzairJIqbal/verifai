// The two bias checks: the same trial shown to the judge changed in one way
// that shouldn't matter, and how many verdicts moved. Order: the conversation
// before the policy and the date, the criteria asked in reverse. Padding: a
// reply you labelled good, with a few harmless closing sentences added. A
// judge that changes its mind over either is reading something other than
// the rubric. Pure.
import type { Background } from "../graders/hallucination";
import { conversationLines } from "../judge/conversation";
import type { JudgeRequest } from "../judge/rubric";
import { JUDGE_CRITERIA, type JudgeCheck, type JudgeCriterion, type Step } from "../results/schema";
import type { BiasCheck, BiasResult, JudgeSplit, Label, TrialRef } from "./schema";

// Says nothing about the order, the shop's rules or the customer's question,
// so it can't make a good reply worse.
export const PADDING =
  "I hope this helps. If anything else comes up with your order or your accessories, just send us a message here and we'll be glad to look into it. Thank you for shopping with us, and have a good day.";

export const BIAS_DESCRIPTIONS: Record<BiasCheck, string> = {
  order: "The conversation shown before the policy and the date, and the criteria asked in reverse order.",
  padding: "Trials you labelled as passing every criterion, with harmless closing sentences added to the agent's last reply.",
};

export function orderSwappedRequest(steps: Step[], background: Background, criteria: JudgeCriterion[]): JudgeRequest {
  const { lines } = conversationLines(steps);
  const reversed = [...criteria].reverse();
  const input = ["CONVERSATION:", ...lines, "", `TODAY: ${background.today}`, "", "POLICY:", background.policy, "", `CRITERIA TO JUDGE: ${reversed.join(", ")}`].join("\n");
  return { input, criteria: reversed };
}

export function paddedSteps(steps: Step[]): Step[] {
  const last = steps.findLastIndex((s) => s.type === "text");
  return steps.map((s, i) => (i === last && s.type === "text" ? { ...s, text: `${s.text.trimEnd()}\n\n${PADDING}` } : s));
}

// Padding is only for replies you said were good: on a failing reply, a pass
// could be the padding or the judge fixing its own mistake.
export const paddingEligible = (label: Label): boolean => label.criteria.length > 0 && label.criteria.every((c) => c.pass);

export type BiasPair = TrialRef & { split: JudgeSplit; before: Extract<JudgeCheck, { status: "judged" }>; after: JudgeCheck };

// Every verdict before against after. Which ones moved is kept only for
// judge-dev trials: those are the ones you may look into, and judge-test
// stays counts only.
export function tallyBias(check: BiasCheck, judge: string, ranAt: string, pairs: BiasPair[]): BiasResult {
  const byCriterion = new Map(JUDGE_CRITERIA.map((c) => [c, { criterion: c, verdicts: 0, changed: 0, passToFail: 0, failToPass: 0 }]));
  const changes: BiasResult["changes"] = [];
  let ungraded = 0;
  const graded = new Set<string>();
  for (const p of pairs) {
    if (p.after.status !== "judged") {
      ungraded++;
      continue;
    }
    graded.add(p.taskId);
    for (const b of p.before.verdicts) {
      const a = p.after.verdicts.find((v) => v.criterion === b.criterion);
      if (!a) continue;
      const tally = byCriterion.get(b.criterion)!;
      tally.verdicts++;
      if (a.pass === b.pass) continue;
      tally.changed++;
      if (b.pass) tally.passToFail++;
      else tally.failToPass++;
      if (p.split === "judge-dev") changes.push({ runId: p.runId, taskId: p.taskId, tryNumber: p.tryNumber, criterion: b.criterion, before: b.pass, after: a.pass });
    }
  }
  const rows = [...byCriterion.values()].filter((r) => r.verdicts > 0);
  return {
    check,
    judge,
    ranAt,
    description: BIAS_DESCRIPTIONS[check],
    trials: pairs.length - ungraded,
    tasks: graded.size,
    ungraded,
    verdicts: rows.reduce((n, r) => n + r.verdicts, 0),
    changed: rows.reduce((n, r) => n + r.changed, 0),
    byCriterion: rows,
    changes,
  };
}
