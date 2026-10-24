// The improvement chart's numbers: one point per promoted version, from the
// runs of the gate that promoted it. Pure and browser-safe: gate records,
// run files and review files in, points out; nothing is read here.
import type { GateRecord } from "../gate/schema";
import type { Report, Trial } from "../results/schema";
import { latestTags } from "../review/report";
import { trialKey, type Note, type Tag, type Taxonomy, type TrialRef } from "../review/schema";
import { bootstrapRatio, type Estimate } from "../stats/stats";

// A number that could be had, or why not in plain words with what to run.
export type Measured<T> = ({ ok: true } & T) | { ok: false; reason: string };

export type Sample = { estimate: Estimate; tasks: number; tries: number };

export type CategoryCount = { id: string; name: string; count: number };

export type VersionPoint = {
  version: string;
  // The knobs, as the gate wrote them.
  label: string;
  // Null for the version the first gate started from.
  gate: GateRecord | null;
  datasetVersion: string;
  devRunId: string;
  holdoutRunId: string;
  holdout: Measured<Sample>;
  // Agent replies with an unsupported or contradicted claim, over all replies.
  hallucination: Measured<Sample & { replies: number; flagged: number }>;
  // Agent, claim-checker and judge spend over the dev run's passed tries.
  cost: Measured<Sample & { passed: number; totalUsd: number }>;
  // The dev run's failed tries by their reviewed category. Failures with no
  // note, no tag or a tag the taxonomy no longer has are `notReviewed`.
  categories: Measured<{ failures: number; reviewed: number; notReviewed: number; rows: CategoryCount[] }>;
  // The category this version's change was aimed at (null for the first).
  targets: string | null;
  // Failed dev tries of the version before, tagged with `targets`: where the
  // fix came from. Three at most.
  examples: TrialRef[];
};

export type Improvement = {
  versions: VersionPoint[];
  // Gates that didn't promote anything: listed, never drawn as progress.
  notPromoted: GateRecord[];
  // Everything that didn't add up, in plain words.
  problems: string[];
};

export type RunData = { report: Report; trials: Trial[] | null };

export type ImprovementInput = {
  gates: GateRecord[];
  // A run's files, or why they couldn't be read.
  run: (runId: string) => RunData | string;
  // Every listed run's configuration key, to find the dev runs a version's
  // failures were reviewed on.
  configKeys: Map<string, string>;
  notes: Note[];
  tags: Tag[];
  taxonomy: Taxonomy | null;
};

const byDecided = (a: GateRecord, b: GateRecord) => (a.decidedAt < b.decidedAt ? -1 : a.decidedAt > b.decidedAt ? 1 : 0);
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const MAX_EXAMPLES = 3;

// The promoted gates in order, each built on the one before. A promoted gate
// off that line can't be placed, so it's reported rather than drawn.
function promotionLine(gates: GateRecord[], problems: string[]): GateRecord[] {
  const promoted = gates.filter((g) => g.passed && g.promoted).sort(byDecided);
  const line: GateRecord[] = [];
  for (const g of promoted) {
    const previous = line.at(-1);
    if (previous === undefined || g.basedOn === previous.name) line.push(g);
    else problems.push(`${g.name} was promoted on top of ${g.basedOn}, but the version before it is ${previous.name}. It isn't drawn; check results/gates/.`);
  }
  return line;
}

function holdoutPoint(data: RunData | string, runId: string): Measured<Sample> {
  if (typeof data === "string") return { ok: false, reason: data };
  const overall = data.report.stats?.overall;
  const estimate = overall?.passHat[0];
  if (!overall || !estimate) return { ok: false, reason: `Holdout run ${runId} has no success rate.` };
  return { ok: true, estimate, tasks: overall.tasks, tries: overall.tries };
}

function hallucinationPoint(data: RunData | string, runId: string): VersionPoint["hallucination"] {
  if (typeof data === "string") return { ok: false, reason: data };
  const claims = data.report.hallucination?.claims ?? null;
  if (claims === null) return { ok: false, reason: `The claim checker hasn't read dev run ${runId}. Run \`pnpm claims ${runId}\`.` };
  const read = claims.checked + claims.ungraded;
  if (read < claims.checkable) {
    return { ok: false, reason: `The claim checker read ${read} of ${claims.checkable} tries of ${runId}. Run \`pnpm claims ${runId}\` to finish.` };
  }
  const r = claims.responses;
  if (r.rate === null) return { ok: false, reason: `Dev run ${runId} has no checked replies.` };
  return { ok: true, estimate: r.rate, tasks: r.tasks, tries: r.tries, replies: r.replies, flagged: r.flagged };
}

// A try's whole spend. Null when a check it had (or should have had) wasn't
// priced: a part missing would make the version look cheaper than it was.
function trialCost(t: Trial): number | null {
  if (t.status === "errored") return t.costUsd;
  if (t.claims === null || t.claims.cost === undefined) return null;
  if (t.judge !== null && t.judge.cost === undefined) return null;
  return t.costUsd + t.claims.cost.costUsd + (t.judge?.cost?.costUsd ?? 0);
}

function costPoint(data: RunData | string, runId: string): VersionPoint["cost"] {
  if (typeof data === "string") return { ok: false, reason: data };
  if (data.trials === null) return { ok: false, reason: `Dev run ${runId}'s tries aren't readable.` };
  const judge = data.report.judge;
  if (judge === null || judge.judged + judge.ungraded < judge.judgeable) {
    return { ok: false, reason: `The judge hasn't read every try of ${runId}, so its cost isn't all known. Run \`pnpm judge ${runId}\`.` };
  }
  const byTask = new Map<string, { hits: number; chances: number }>();
  let tries = 0;
  for (const t of data.trials) {
    const usd = trialCost(t);
    if (usd === null) {
      return {
        ok: false,
        reason: `Some checks on ${runId} were answered before their token counts were saved, so its cost isn't known. Runs checked from now on record it.`,
      };
    }
    const part = byTask.get(t.taskId) ?? { hits: 0, chances: 0 };
    byTask.set(t.taskId, { hits: part.hits + usd, chances: part.chances + (t.status === "passed" ? 1 : 0) });
    tries++;
  }
  const parts = [...byTask].sort(([a], [b]) => byId(a, b)).map(([, p]) => p);
  const passed = parts.reduce((a, p) => a + p.chances, 0);
  const totalUsd = parts.reduce((a, p) => a + p.hits, 0);
  if (passed === 0) return { ok: false, reason: `No try of ${runId} passed, so there's no cost per success.` };
  return { ok: true, estimate: bootstrapRatio(parts), tasks: byTask.size, tries, passed, totalUsd };
}

function categoriesPoint(data: RunData | string, runId: string, notes: Note[], latest: Map<string, Tag>, taxonomy: Taxonomy | null): VersionPoint["categories"] {
  if (typeof data === "string") return { ok: false, reason: data };
  if (data.trials === null) return { ok: false, reason: `Dev run ${runId}'s tries aren't readable.` };
  if (taxonomy === null) return { ok: false, reason: "There's no failure taxonomy yet. Review failures on /review, then run `pnpm taxonomy`." };
  const noted = new Set(notes.filter((n) => n.runId === runId).map(trialKey));
  const counts = new Map(taxonomy.categories.map((c) => [c.id, 0]));
  const failed = data.trials.filter((t) => t.status === "failed");
  let reviewed = 0;
  for (const t of failed) {
    const key = trialKey({ runId, taskId: t.taskId, tryNumber: t.tryNumber });
    const category = noted.has(key) ? latest.get(key)?.category : undefined;
    const seen = category === undefined ? undefined : counts.get(category);
    if (category === undefined || seen === undefined) continue;
    counts.set(category, seen + 1);
    reviewed++;
  }
  return {
    ok: true,
    failures: failed.length,
    reviewed,
    notReviewed: failed.length - reviewed,
    rows: taxonomy.categories.map((c) => ({ id: c.id, name: c.name, count: counts.get(c.id) ?? 0 })),
  };
}

export function improvementSeries(input: ImprovementInput): Improvement {
  const problems: string[] = [];
  const line = promotionLine(input.gates, problems);
  const notPromoted = input.gates.filter((g) => !(g.passed && g.promoted)).sort(byDecided);
  for (const g of notPromoted) if (g.passed) problems.push(`${g.name} passed its gate but wasn't promoted: promotion broke partway. Look at its gate record.`);
  const first = line[0];
  if (first === undefined) return { versions: [], notPromoted, problems };

  const datasets = new Set(line.map((g) => g.datasetVersion));
  if (datasets.size > 1) {
    problems.push(`The versions were gated on different datasets (${[...datasets].sort().join(", ")}), so their holdout numbers aren't measured on the same tasks.`);
  }

  const latest = latestTags(input.tags);
  const point = (o: { version: string; label: string; gate: GateRecord | null; datasetVersion: string; devRunId: string; holdoutRunId: string; examples: TrialRef[] }): VersionPoint => {
    const dev = input.run(o.devRunId);
    const holdout = input.run(o.holdoutRunId);
    return {
      ...o,
      holdout: holdoutPoint(holdout, o.holdoutRunId),
      hallucination: hallucinationPoint(dev, o.devRunId),
      cost: costPoint(dev, o.devRunId),
      categories: categoriesPoint(dev, o.devRunId, input.notes, latest, input.taxonomy),
      targets: o.gate?.targets ?? null,
    };
  };

  // Failed tries tagged with what the gate targets, on any dev run with the
  // configuration of the version the gate started from.
  const examples = (g: GateRecord): TrialRef[] => {
    const key = input.configKeys.get(g.runs.promotedDev);
    if (key === undefined) return [];
    return input.notes
      .filter((n) => input.configKeys.get(n.runId) === key && latest.get(trialKey(n))?.category === g.targets)
      .map(({ runId, taskId, tryNumber }) => ({ runId, taskId, tryNumber }))
      .sort((a, b) => byId(trialKey(a), trialKey(b)))
      .slice(0, MAX_EXAMPLES);
  };

  const versions = [
    point({
      version: first.basedOn,
      label: first.promotedLabel,
      gate: null,
      datasetVersion: first.datasetVersion,
      devRunId: first.runs.promotedDev,
      holdoutRunId: first.runs.promotedHoldout,
      examples: [],
    }),
    ...line.map((g) =>
      point({
        version: g.name,
        label: g.candidateLabel,
        gate: g,
        datasetVersion: g.datasetVersion,
        devRunId: g.runs.candidateDev,
        holdoutRunId: g.runs.candidateHoldout,
        examples: examples(g),
      }),
    ),
  ];
  return { versions, notPromoted, problems };
}
