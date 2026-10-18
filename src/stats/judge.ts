// The AI judge's verdicts across a run, one row per criterion. Kept apart
// from the success rate: the judge never decides whether a try passed.
// Browser-safe and pure.
import { JUDGE_CRITERIA, type JudgeCheck, type JudgeReport, type JudgeRow, type Trial } from "../results/schema";
import { shareOverTasks } from "./graders";

export function judgeReport(trials: Trial[]): JudgeReport | null {
  // What the judge could read: tries that ran and wrote a reply.
  const judgeable = trials.filter((t) => t.status !== "errored" && t.steps.some((s) => s.type === "text"));
  const read = judgeable.flatMap((t) => (t.judge === null ? [] : [{ trial: t, check: t.judge }]));
  if (read.length === 0) return null;
  const judged = read.flatMap(({ trial, check }) => (check.status === "judged" ? [{ taskId: trial.taskId, verdicts: check.verdicts }] : []));

  // A criterion counts only the tries it was asked about: refusal explained
  // is over the tries that refused, not over the run.
  const criteria = JUDGE_CRITERIA.flatMap((criterion): JudgeRow[] => {
    const rows = judged.flatMap(({ taskId, verdicts }) => verdicts.filter((v) => v.criterion === criterion).map((v) => ({ taskId, hit: v.pass })));
    if (rows.length === 0) return [];
    return [{ criterion, tasks: new Set(rows.map((r) => r.taskId)).size, tries: rows.length, passed: rows.filter((r) => r.hit).length, rate: shareOverTasks(rows) }];
  });

  return {
    judges: [...new Set(read.map(({ check }) => judgeCheckLabel(check)))].sort(),
    judgeable: judgeable.length,
    judged: judged.length,
    ungraded: read.length - judged.length,
    criteria,
  };
}

export const judgeCheckLabel = (check: Pick<JudgeCheck, "model" | "rubricVersion">): string => `${check.model} · rubric ${check.rubricVersion}`;
