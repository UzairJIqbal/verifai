// The AI judge's section in words and as a table: the same in the terminal,
// report.md and the run page. Browser-safe.
import { withInterval } from "../stats/format";
import type { JudgeCriterion, JudgeReport } from "./schema";

// What each criterion asks, in a line. The rubric file holds the full words.
export const JUDGE_CRITERION_TEXT: Record<JudgeCriterion, { name: string; asks: string }> = {
  "refusal-explained": { name: "refusal explained", asks: "When the agent turned something down, it said which rule and what the customer can do instead. Asked only on tries where the task expects a refusal and the agent gave one." },
  "answered-question": { name: "answered question", asks: "Every request the customer made was answered, done or turned down." },
  tone: { name: "tone", asks: "Polite and plain: no blame, no over-apologising, no internal words." },
};

export function judgeTable(j: JudgeReport): { header: string[]; rows: string[][] } {
  return {
    header: ["", "tasks", "tries", "passed", "pass rate"],
    rows: j.criteria.map((c) => [JUDGE_CRITERION_TEXT[c.criterion].name, String(c.tasks), String(c.tries), `${c.passed}/${c.tries} tries`, c.rate === null ? "–" : withInterval(c.rate)]),
  };
}

// Who judged and how much of the run.
export function judgeCoverage(j: JudgeReport): string {
  const left = j.judgeable - j.judged - j.ungraded;
  return (
    `Judged by ${j.judges.join(", ")}: ${j.judged} of ${j.judgeable} tries with a reply` +
    (j.ungraded > 0 ? `, ${j.ungraded} couldn't be graded (counted apart, never as a pass)` : "") +
    (left > 0 ? `, ${left} not judged yet (\`pnpm judge\` carries on)` : "") +
    "."
  );
}

export const JUDGE_NOT_RUN = "The AI judge hasn't read this run. `pnpm judge <run>` sends about one judge call per try with a reply.";
