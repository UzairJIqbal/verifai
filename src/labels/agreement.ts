// How far each judge agrees with your labels: TPR, TNR, Cohen's κ and a
// confusion matrix, on judge-test and, marked as the one tuned on, judge-dev.
// "Positive" is what the judge is there to catch: a failed criterion, or a
// claim that isn't supported. Pure: labels and snapshots in, numbers out.
import { CLAIM_LABELS, JUDGE_CRITERIA, type ClaimLabel, type JudgeCriterion } from "../results/schema";
import { JUDGE_CRITERION_TEXT } from "../results/judge-text";
import { judgeCheckLabel } from "../stats/judge";
import { agreementEstimate, type AgreementEstimate } from "../stats/stats";
import { claimsCheckLabel } from "./files";
import { JUDGE_SPLITS, LABEL_SOURCES, trialKey, type JudgeSnapshot, type JudgeSplit, type Label, type LabelSource, type TrialRef } from "./schema";

export type JudgeKind = "judge" | "claims";

type Item = { taskId: string; truth: boolean; predicted: boolean };

export type AgreementRow = {
  // A criterion's name, "all criteria", or "claims".
  name: string;
  tasks: number;
  trials: number;
  items: number;
  agreement: AgreementEstimate | null;
  // Claims only: your label (rows) against the checker's (columns), in CLAIM_LABELS order.
  matrix: number[][] | null;
};

export type SplitAgreement = {
  rows: AgreementRow[];
  // Labelled trials this judge version has a verdict for, and of them, the
  // ones whose answer couldn't be read: left out, never counted as agreeing.
  trials: number;
  ungraded: number;
  // Your claims with no claim of the same words from this checker version.
  unmatchedClaims: number;
};

export type VersionAgreement = { kind: JudgeKind; judge: string; firstSeen: string; bySplit: Record<JudgeSplit, SplitAgreement> };

export type Comparison = { kind: JudgeKind; before: string; after: string; trials: number; rows: { name: string; before: AgreementRow; after: AgreementRow }[] };

export type Mistake = TrialRef & { what: string; yours: string; judges: string; reason: string };

export type AgreementReport = {
  labels: { total: number; bySplit: Record<JudgeSplit, { trials: number; tasks: number }> };
  versions: VersionAgreement[];
  // Each later version of a judge against its first, on judge-test, on the
  // trials both read.
  comparisons: Comparison[];
  // Where the current judges disagree with you on judge-dev: what you may
  // tune against. Never judge-test.
  devMistakes: Mistake[];
};

const byTaskId = (a: { taskId: string }, b: { taskId: string }) => (a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0);

function row(name: string, items: Item[], trials: Set<string>, matrix: number[][] | null): AgreementRow {
  const groups = new Map<string, Item[]>();
  for (const i of [...items].sort(byTaskId)) groups.set(i.taskId, [...(groups.get(i.taskId) ?? []), i]);
  return {
    name,
    tasks: groups.size,
    trials: trials.size,
    items: items.length,
    agreement: items.length === 0 ? null : agreementEstimate([...groups.values()]),
    matrix,
  };
}

const snapshotFor = (snapshots: JudgeSnapshot[], kind: JudgeKind, judge: string) => {
  const out = new Map<string, JudgeSnapshot>();
  for (const s of snapshots) {
    if (s.kind !== kind) continue;
    const label = s.kind === "judge" ? judgeCheckLabel(s.check) : claimsCheckLabel(s.check);
    if (label === judge) out.set(trialKey(s), s);
  }
  return out;
};

// Your claims paired with the checker's by their step and words, each of the
// checker's used once.
function pairClaims(label: Label, judged: { step: number; text: string; label: ClaimLabel; reason: string }[]) {
  const left = [...judged];
  const pairs: { yours: Label["claims"][number]; theirs: (typeof judged)[number] }[] = [];
  let unmatched = 0;
  for (const c of label.claims) {
    const at = left.findIndex((j) => j.step === c.step && j.text.trim() === c.text.trim());
    if (at === -1) unmatched++;
    else pairs.push({ yours: c, theirs: left.splice(at, 1)[0] });
  }
  return { pairs, unmatched };
}

function judgeSplit(labels: Label[], snaps: Map<string, JudgeSnapshot>, keep: (key: string) => boolean = () => true): SplitAgreement {
  const items = new Map<JudgeCriterion, Item[]>(JUDGE_CRITERIA.map((c) => [c, []]));
  const trials = new Map<JudgeCriterion, Set<string>>(JUDGE_CRITERIA.map((c) => [c, new Set()]));
  const all = new Set<string>();
  let read = 0;
  let ungraded = 0;
  for (const l of labels) {
    const key = trialKey(l);
    const s = snaps.get(key);
    if (!s || s.kind !== "judge" || !keep(key)) continue;
    read++;
    if (s.check.status !== "judged") {
      ungraded++;
      continue;
    }
    for (const c of l.criteria) {
      const v = s.check.verdicts.find((x) => x.criterion === c.criterion);
      if (!v) continue;
      items.get(c.criterion)!.push({ taskId: l.taskId, truth: !c.pass, predicted: !v.pass });
      trials.get(c.criterion)!.add(key);
      all.add(key);
    }
  }
  const rows = JUDGE_CRITERIA.map((c) => row(JUDGE_CRITERION_TEXT[c].name, items.get(c)!, trials.get(c)!, null));
  rows.push(row("all criteria", JUDGE_CRITERIA.flatMap((c) => items.get(c)!), all, null));
  return { rows, trials: read, ungraded, unmatchedClaims: 0 };
}

function claimsSplit(labels: Label[], snaps: Map<string, JudgeSnapshot>, keep: (key: string) => boolean = () => true): SplitAgreement {
  const items: Item[] = [];
  const matrix = CLAIM_LABELS.map(() => CLAIM_LABELS.map(() => 0));
  const trials = new Set<string>();
  let read = 0;
  let ungraded = 0;
  let unmatchedClaims = 0;
  for (const l of labels) {
    const key = trialKey(l);
    const s = snaps.get(key);
    if (!s || s.kind !== "claims" || !keep(key)) continue;
    read++;
    if (s.check.status !== "checked") {
      ungraded++;
      continue;
    }
    const { pairs, unmatched } = pairClaims(l, s.check.claims);
    unmatchedClaims += unmatched;
    for (const { yours, theirs } of pairs) {
      items.push({ taskId: l.taskId, truth: yours.label !== "supported", predicted: theirs.label !== "supported" });
      matrix[CLAIM_LABELS.indexOf(yours.label)][CLAIM_LABELS.indexOf(theirs.label)]++;
      trials.add(key);
    }
  }
  return { rows: [row("claims", items, trials, matrix)], trials: read, ungraded, unmatchedClaims };
}

const splitOf = (labels: Label[], split: JudgeSplit) => labels.filter((l) => l.split === split);

// `current` is the judges the config uses now, as their labels; their
// judge-dev disagreements are listed.
export function agreementReport(labels: Label[], snapshots: JudgeSnapshot[], current: { judge: string; claims: string }): AgreementReport {
  const firstSeen = new Map<string, { kind: JudgeKind; judge: string; at: string }>();
  for (const s of snapshots) {
    const judge = s.kind === "judge" ? judgeCheckLabel(s.check) : claimsCheckLabel(s.check);
    const id = `${s.kind}|${judge}`;
    const seen = firstSeen.get(id);
    if (!seen || s.recordedAt < seen.at) firstSeen.set(id, { kind: s.kind, judge, at: s.recordedAt });
  }
  // The rubric judge first, then the claim checker; each one's versions oldest first.
  const KIND_ORDER: JudgeKind[] = ["judge", "claims"];
  const ordered = [...firstSeen.values()].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || (a.at < b.at ? -1 : a.at > b.at ? 1 : a.judge.localeCompare(b.judge)),
  );

  const versions: VersionAgreement[] = ordered.map(({ kind, judge, at }) => {
    const snaps = snapshotFor(snapshots, kind, judge);
    const compute = kind === "judge" ? judgeSplit : claimsSplit;
    return { kind, judge, firstSeen: at, bySplit: { "judge-dev": compute(splitOf(labels, "judge-dev"), snaps), "judge-test": compute(splitOf(labels, "judge-test"), snaps) } };
  });

  const comparisons: Comparison[] = [];
  for (const kind of ["judge", "claims"] as const) {
    const ofKind = ordered.filter((v) => v.kind === kind);
    if (ofKind.length < 2) continue;
    const base = ofKind[0];
    const baseSnaps = snapshotFor(snapshots, kind, base.judge);
    const test = splitOf(labels, "judge-test");
    for (const later of ofKind.slice(1)) {
      const laterSnaps = snapshotFor(snapshots, kind, later.judge);
      // Only trials both versions read, so the two numbers are over the same labels.
      const both = (key: string) => baseSnaps.has(key) && laterSnaps.has(key);
      const compute = kind === "judge" ? judgeSplit : claimsSplit;
      const before = compute(test, baseSnaps, both);
      const after = compute(test, laterSnaps, both);
      comparisons.push({
        kind,
        before: base.judge,
        after: later.judge,
        trials: test.filter((l) => both(trialKey(l))).length,
        rows: before.rows.map((r, i) => ({ name: r.name, before: r, after: after.rows[i] })),
      });
    }
  }

  const devMistakes: Mistake[] = [];
  const judgeSnaps = snapshotFor(snapshots, "judge", current.judge);
  const claimSnaps = snapshotFor(snapshots, "claims", current.claims);
  for (const l of splitOf(labels, "judge-dev")) {
    const ref = { runId: l.runId, taskId: l.taskId, tryNumber: l.tryNumber };
    const j = judgeSnaps.get(trialKey(l));
    if (j?.kind === "judge" && j.check.status === "judged") {
      for (const c of l.criteria) {
        const v = j.check.verdicts.find((x) => x.criterion === c.criterion);
        if (v && v.pass !== c.pass) devMistakes.push({ ...ref, what: JUDGE_CRITERION_TEXT[c.criterion].name, yours: c.pass ? "pass" : "fail", judges: v.pass ? "pass" : "fail", reason: v.reason });
      }
    }
    const k = claimSnaps.get(trialKey(l));
    if (k?.kind === "claims" && k.check.status === "checked") {
      for (const { yours, theirs } of pairClaims(l, k.check.claims).pairs) {
        if ((yours.label === "supported") !== (theirs.label === "supported")) {
          devMistakes.push({ ...ref, what: `claim at #${yours.step}: "${yours.text}"`, yours: yours.label, judges: theirs.label, reason: theirs.reason });
        }
      }
    }
  }

  const bySplit = Object.fromEntries(
    JUDGE_SPLITS.map((s) => {
      const ls = splitOf(labels, s);
      return [s, { trials: ls.length, tasks: new Set(ls.map((l) => l.taskId)).size }];
    }),
  ) as Record<JudgeSplit, { trials: number; tasks: number }>;

  return { labels: { total: labels.length, bySplit }, versions, comparisons, devMistakes };
}

export type SourceReport = { source: LabelSource; report: AgreementReport };

// One report per kind of labeller, never pooled. Human labels are the ground
// truth; model labels are another model's reading of the same rubric, so
// agreeing with them shows two models read it alike, not that the judge is
// right. Mixing them would let 93 model labels pass for human evidence.
export const reportsBySource = (labels: Label[], snapshots: JudgeSnapshot[], current: { judge: string; claims: string }): SourceReport[] =>
  LABEL_SOURCES.map((source) => ({ source, report: agreementReport(labels.filter((l) => l.source === source), snapshots, current) }));
