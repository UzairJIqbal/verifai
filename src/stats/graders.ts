// The per-grader section of a run report, from the tries' verdicts and steps,
// and the tags that link each of its numbers to the tries behind it.
// Browser-safe and pure.
import type { ClaimCheck, GraderReport, GraderRow, ToolRow, Trial } from "../results/schema";
import { bootstrapRatio, meanEstimate, passEstimate, type Estimate, type TaskOutcome } from "./stats";

const byTaskId = <T extends { taskId: string }>(rows: T[]) => [...rows].sort((a, b) => (a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0));

function groupByTask<T extends { taskId: string }>(rows: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of byTaskId(rows)) out.set(r.taskId, [...(out.get(r.taskId) ?? []), r]);
  return out;
}

// A share of tries, averaged over tasks with an interval: each task's own
// share first, the same way the success rate is built. Tasks with no tries
// in the share's denominator are left out.
export function shareOverTasks(rows: { taskId: string; hit: boolean }[]): Estimate | null {
  if (rows.length === 0) return null;
  const tasks: TaskOutcome[] = [...groupByTask(rows)].map(([taskId, tries]) => ({ taskId, tries: tries.length, successes: tries.filter((t) => t.hit).length }));
  return passEstimate(tasks, 1, "hat");
}

const toolsCalled = (t: Pick<Trial, "steps">): Set<string> => new Set(t.steps.flatMap((s) => (s.type === "tool-call" ? [s.toolName] : [])));
const callCount = (t: Trial): number => t.steps.filter((s) => s.type === "tool-call").length;

function graderRow(grader: string, trials: Trial[]): GraderRow {
  const verdicts = trials.map((t) => ({ taskId: t.taskId, v: t.verdicts.find((v) => v.grader === grader) }));
  // A grader with no verdict on a try didn't run on it: counted as couldn't grade.
  const graded = verdicts.flatMap(({ taskId, v }) => (v && !v.ungraded ? [{ taskId, hit: v.pass }] : []));
  return {
    grader,
    tasks: new Set(trials.map((t) => t.taskId)).size,
    tries: trials.length,
    graded: graded.length,
    passed: graded.filter((g) => g.hit).length,
    ungraded: trials.length - graded.length,
    rate: shareOverTasks(graded),
  };
}

function toolRow(tool: string, trials: Trial[]): ToolRow {
  const rows = trials.map((t) => {
    const called = toolsCalled(t).has(tool);
    const expected = (t.expectedTools ?? []).includes(tool);
    return { taskId: t.taskId, called, expected };
  });
  const perTask = [...groupByTask(rows)].map(([, tries]) => ({
    both: tries.filter((r) => r.called && r.expected).length,
    called: tries.filter((r) => r.called).length,
    expected: tries.filter((r) => r.expected).length,
  }));
  const ratio = (pick: (p: (typeof perTask)[number]) => number) => {
    const e = bootstrapRatio(perTask.map((p) => ({ hits: p.both, chances: pick(p) })));
    return Number.isNaN(e.value) ? null : e;
  };
  return {
    tool,
    tasks: perTask.length,
    tries: rows.length,
    called: rows.filter((r) => r.called).length,
    expected: rows.filter((r) => r.expected).length,
    both: rows.filter((r) => r.called && r.expected).length,
    precision: ratio((p) => p.called),
    recall: ratio((p) => p.expected),
  };
}

function meanOverTasks(rows: { taskId: string; value: number }[]): Estimate | null {
  if (rows.length === 0) return null;
  const perTask = [...groupByTask(rows)].map(([, tries]) => tries.reduce((a, r) => a + r.value, 0) / tries.length);
  return meanEstimate(perTask);
}

/**
 * Errored tries have no verdicts and are left out of every number here; the
 * count is reported. `graders` and `tools` fix the order rows are listed in;
 * `referenceLength` is each task's reference size.
 */
export function graderReport(args: {
  trials: Trial[];
  graders: readonly string[];
  policyRules: readonly string[];
  tools: readonly string[];
  referenceLength: Map<string, number>;
}): GraderReport {
  const ran = args.trials.filter((t) => t.status !== "errored");
  const rows = args.graders.map((g) => graderRow(g, ran));

  const policyTries = ran.filter((t) => args.policyRules.every((rule) => t.verdicts.some((v) => v.grader === rule && !v.ungraded)));
  const violatedTry = (t: Trial) => t.verdicts.some((v) => args.policyRules.includes(v.grader) && !v.ungraded && !v.pass);
  const violations = policyTries.map((t) => ({ taskId: t.taskId, hit: violatedTry(t) }));

  const loopVerdicts = ran.flatMap((t) => {
    const v = t.verdicts.find((x) => x.grader === "loop");
    return v && !v.ungraded ? [{ taskId: t.taskId, hit: !v.pass }] : [];
  });
  const withReference = ran.filter((t) => (args.referenceLength.get(t.taskId) ?? 0) > 0);

  return {
    tasks: new Set(ran.map((t) => t.taskId)).size,
    tries: ran.length,
    errored: args.trials.length - ran.length,
    graders: rows,
    policy: {
      tasks: new Set(policyTries.map((t) => t.taskId)).size,
      tries: policyTries.length,
      violated: violations.filter((v) => v.hit).length,
      rate: shareOverTasks(violations),
    },
    tools: args.tools.map((tool) => toolRow(tool, ran)),
    efficiency: {
      tasks: new Set(withReference.map((t) => t.taskId)).size,
      tries: withReference.length,
      toolCalls: meanOverTasks(withReference.map((t) => ({ taskId: t.taskId, value: callCount(t) }))),
      reference: meanOverTasks(withReference.map((t) => ({ taskId: t.taskId, value: args.referenceLength.get(t.taskId) ?? 0 }))),
      loops: loopVerdicts.filter((v) => v.hit).length,
      loopRate: shareOverTasks(loopVerdicts),
    },
  };
}

// Tags a try carries, so every number in the section can link to its tries:
// `fail:<grader>`, `ungraded:<grader>`, `policy-violation`, and per tool
// `called:`, `expected:`, `right:` (called and needed), `wrong:` (called but
// not needed) and `missed:` (needed but not called). From the claim checker,
// `claims:flagged` (a reply has an unsupported or contradicted claim),
// `claims:unsupported`, `claims:contradicted` and `ungraded:claims`.
export function trialTags(t: Pick<Trial, "status" | "verdicts" | "steps" | "expectedTools" | "claims">): Set<string> {
  const tags = new Set<string>();
  if (t.status === "errored") return tags;
  for (const tag of claimTags(t.claims)) tags.add(tag);
  for (const v of t.verdicts) {
    if (v.ungraded) tags.add(`ungraded:${v.grader}`);
    else if (!v.pass) {
      tags.add(`fail:${v.grader}`);
      if (v.grader.startsWith("policy:")) tags.add("policy-violation");
    }
  }
  const called = toolsCalled(t);
  const expected = new Set(t.expectedTools ?? []);
  for (const tool of called) tags.add(`called:${tool}`).add(expected.has(tool) ? `right:${tool}` : `wrong:${tool}`);
  for (const tool of expected) tags.add(`expected:${tool}`).add(called.has(tool) ? `right:${tool}` : `missed:${tool}`);
  return tags;
}

function claimTags(claims: ClaimCheck | null): string[] {
  if (claims === null) return [];
  if (claims.status === "ungraded") return ["ungraded:claims"];
  const labels = new Set(claims.claims.map((c) => c.label));
  return [
    ...(labels.has("unsupported") || labels.has("contradicted") ? ["claims:flagged"] : []),
    ...(labels.has("unsupported") ? ["claims:unsupported"] : []),
    ...(labels.has("contradicted") ? ["claims:contradicted"] : []),
  ];
}

// A tag in words, for "showing the tries that …".
export function describeTag(tag: string): string {
  if (tag === "policy-violation") return "broke a policy rule";
  if (tag === "claims:flagged") return "have a reply with an unsupported or contradicted claim";
  if (tag === "claims:unsupported") return "have an unsupported claim";
  if (tag === "claims:contradicted") return "have a contradicted claim";
  if (tag === "ungraded:claims") return "the claim checker couldn't grade";
  if (tag === "fail:fabricated-entity") return "wrote a value never seen before (fabricated entity)";
  if (tag === "fail:fabricated-action") return "claimed an action with no matching call (fabricated action)";
  const [kind, name] = [tag.slice(0, tag.indexOf(":")), tag.slice(tag.indexOf(":") + 1)];
  switch (kind) {
    case "fail":
      return `failed ${name}`;
    case "ungraded":
      return `${name} couldn't grade`;
    case "called":
      return `called ${name}`;
    case "expected":
      return `needed ${name}`;
    case "right":
      return `needed and called ${name}`;
    case "wrong":
      return `called ${name} without needing it`;
    case "missed":
      return `needed ${name} but never called it`;
    default:
      return `are tagged ${tag}`;
  }
}
