// The four hallucination rates of a run, from its tries' verdicts and the
// claim checker's labels. Browser-safe and pure.
import { FABRICATED_ACTION, FABRICATED_ENTITY } from "../graders/hallucination";
import type { ClaimCheck, HallucinationReport, Trial } from "../results/schema";
import { shareOverTasks } from "./graders";
import { bootstrapRatio, type Estimate } from "./stats";

type TryRate = HallucinationReport["fabricatedEntity"];

const taskCount = (rows: { taskId: string }[]) => new Set(rows.map((r) => r.taskId)).size;

// A code check's failures over the tries it could grade.
function codeCheckRate(grader: string, ran: Trial[]): TryRate {
  const rows = ran.flatMap((t) => {
    const v = t.verdicts.find((x) => x.grader === grader);
    return v && !v.ungraded ? [{ taskId: t.taskId, hit: !v.pass }] : [];
  });
  return { tasks: taskCount(rows), tries: rows.length, hits: rows.filter((r) => r.hit).length, rate: shareOverTasks(rows) };
}

const replyCount = (t: Trial) => t.steps.filter((s) => s.type === "text").length;

const isFlagged = (label: string) => label === "unsupported" || label === "contradicted";

// Hits over chances, pooled within each task and resampled over tasks: a
// task with many replies or claims counts for more, as it should when the
// unit is the reply or the claim.
function pooledByTask(rows: { taskId: string; hits: number; chances: number }[]): Estimate | null {
  const byTask = new Map<string, { hits: number; chances: number }>();
  for (const r of rows) {
    const t = byTask.get(r.taskId) ?? { hits: 0, chances: 0 };
    byTask.set(r.taskId, { hits: t.hits + r.hits, chances: t.chances + r.chances });
  }
  const parts = [...byTask].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, p]) => p);
  const e = bootstrapRatio(parts);
  return Number.isNaN(e.value) ? null : e;
}

export function hallucinationReport(trials: Trial[]): HallucinationReport {
  const ran = trials.filter((t) => t.status !== "errored");
  const read = ran.flatMap((t) => (t.claims === null ? [] : [{ trial: t, check: t.claims }]));
  const checked = read.flatMap(({ trial, check }) => (check.status === "checked" ? [{ trial, claims: check.claims }] : []));

  const responses = checked.map(({ trial, claims }) => {
    const flaggedSteps = new Set(claims.filter((c) => isFlagged(c.label)).map((c) => c.step));
    return { taskId: trial.taskId, hits: flaggedSteps.size, chances: replyCount(trial) };
  });
  const claimRows = checked.map(({ trial, claims }) => ({
    taskId: trial.taskId,
    hits: claims.filter((c) => c.label === "unsupported").length,
    chances: claims.length,
    contradicted: claims.filter((c) => c.label === "contradicted").length,
  }));
  const sum = (rows: { hits: number }[]) => rows.reduce((a, r) => a + r.hits, 0);
  const sumChances = (rows: { chances: number }[]) => rows.reduce((a, r) => a + r.chances, 0);

  return {
    fabricatedEntity: codeCheckRate(FABRICATED_ENTITY, ran),
    fabricatedAction: codeCheckRate(FABRICATED_ACTION, ran),
    claims:
      read.length === 0
        ? null
        : {
            judges: [...new Set(read.map(({ check }) => judgeLabel(check)))].sort(),
            checkable: ran.length,
            checked: checked.length,
            ungraded: read.length - checked.length,
            responses: { tasks: taskCount(responses), tries: responses.length, replies: sumChances(responses), flagged: sum(responses), rate: pooledByTask(responses) },
            claims: {
              tasks: taskCount(claimRows),
              tries: claimRows.length,
              total: sumChances(claimRows),
              unsupported: sum(claimRows),
              contradicted: claimRows.reduce((a, r) => a + r.contradicted, 0),
              rate: pooledByTask(claimRows),
            },
          },
  };
}

export const judgeLabel = (check: Pick<ClaimCheck, "model" | "promptVersion">): string => `${check.model} · claims ${check.promptVersion}`;
