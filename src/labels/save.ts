// Saving one label, for the labelling route. The server decides everything
// that matters: the trial must be the one offered next (so trials stay
// random, not chosen), its criteria and claims must match what the judges
// read, and the split comes from the task id. Only then is the judge's
// answer looked at, and only for judge-dev.
import { loadConfig } from "../config";
import { loadRubric } from "../judge/rubric";
import { appendLabel, LABEL_FILES, readLabels, recordSnapshots, splitFor, type LabelFiles } from "./files";
import { labellingPool, nextToLabel } from "./pick";
import type { SaveLabelRequest, SaveLabelResponse } from "./protocol";
import { trialKey, type Label } from "./schema";

export type SaveOutcome = { ok: true; response: SaveLabelResponse } | { ok: false; status: number; error: string };

export function saveLabel(body: SaveLabelRequest, now: Date, files: LabelFiles = LABEL_FILES): SaveOutcome {
  const rubric = loadRubric(loadConfig().judge.rubricVersion);
  const labels = readLabels(files);
  const key = trialKey(body);
  if (labels.some((l) => trialKey(l) === key)) return { ok: false, status: 409, error: "This trial is already labelled. Reload the page for the next one." };
  const next = nextToLabel(labellingPool(rubric.version), labels);
  if (next === null || trialKey(next) !== key) return { ok: false, status: 409, error: "This isn't the trial up next any more (the runs or the rubric changed). Reload the page." };

  const { judge, claims } = next.trial;
  // isLabellable guarantees both; checked again so the types follow.
  if (judge?.status !== "judged" || claims?.status !== "checked") return { ok: false, status: 409, error: "The judges haven't read this trial. Reload the page." };

  const asked = judge.verdicts.map((v) => v.criterion);
  const given = body.criteria.map((c) => c.criterion);
  if (given.length !== asked.length || asked.some((c) => !given.includes(c))) {
    return { ok: false, status: 400, error: `Mark every criterion the judge was asked: ${asked.join(", ")}.` };
  }
  if (body.claims.length !== claims.claims.length) return { ok: false, status: 400, error: `Label all ${claims.claims.length} claims.` };

  const split = splitFor(next.taskId, labels);
  const label: Label = {
    runId: next.runId,
    taskId: next.taskId,
    tryNumber: next.tryNumber,
    split,
    source: "human",
    rubricVersion: judge.rubricVersion,
    claimsPromptVersion: claims.promptVersion,
    labelledAt: now.toISOString(),
    criteria: asked.map((criterion) => ({ criterion, pass: body.criteria.find((c) => c.criterion === criterion)!.pass })),
    claims: claims.claims.map((c, i) => ({ step: c.step, text: c.text, label: body.claims[i] })),
  };
  appendLabel(label, files);
  // The verdicts this label is compared with, kept before any rerun replaces them.
  recordSnapshots([{ runId: next.runId, taskId: next.taskId, tryNumber: next.tryNumber, judge, claims }], now, files);

  if (split === "judge-test") return { ok: true, response: { split, reveal: null } };
  return {
    ok: true,
    response: {
      split,
      reveal: {
        criteria: judge.verdicts.map((v) => ({ criterion: v.criterion, yours: label.criteria.find((c) => c.criterion === v.criterion)!.pass, judge: v.pass, reason: v.reason })),
        claims: claims.claims.map((c, i) => ({ step: c.step, text: c.text, yours: label.claims[i].label, judge: c.label, reason: c.reason })),
      },
    },
  };
}
