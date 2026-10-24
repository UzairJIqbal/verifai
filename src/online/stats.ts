// A batch's rates over its graded conversations. Each conversation counts as
// one draw, so the interval resamples conversations: online there are no
// repeated tries of a task to keep together.
import { LOOP } from "../graders/efficiency";
import { FABRICATED_ACTION, FABRICATED_ENTITY } from "../graders/hallucination";
import { POLICY_RULES } from "../graders/policy";
import { bootstrapMean, mean } from "../stats/stats";
import { TOOL_ERRORS } from "./grade";
import type { BatchRates, Conversation, OnlineRate } from "./schema";

// Whether one conversation had it: true, false, or null when that can't be
// told (a grader that couldn't run, claims never checked).
type Hit = boolean | null;

// Any failure is a hit, even beside a grader that couldn't run; with no
// failure, one that couldn't run leaves it unknown.
function anyFailed(verdicts: Conversation["verdicts"], graders: readonly string[]): Hit {
  const mine = verdicts.filter((v) => graders.includes(v.grader));
  if (mine.length < graders.length) return null;
  if (mine.some((v) => !v.pass && !v.ungraded)) return true;
  return mine.some((v) => v.ungraded) ? null : false;
}

export function hallucinated(c: Conversation): Hit {
  const fabricated = anyFailed(c.verdicts, [FABRICATED_ENTITY, FABRICATED_ACTION]);
  const claimed: Hit = c.claims === null || c.claims.status === "ungraded" ? null : c.claims.claims.some((x) => x.label !== "supported");
  if (fabricated === true || claimed === true) return true;
  return fabricated === null || claimed === null ? null : false;
}

function rate(hits: Hit[]): OnlineRate {
  const known = hits.filter((h): h is boolean => h !== null).map((h) => (h ? 1 : 0));
  if (known.length === 0) return { hits: 0, of: 0, estimate: null };
  return { hits: known.filter((h) => h === 1).length, of: known.length, estimate: { value: mean(known), ...bootstrapMean(known) } };
}

export function batchRates(conversations: Conversation[]): BatchRates {
  // Sorted by number, so the order they were written in can't move an interval.
  const sorted = [...conversations].sort((a, b) => a.number - b.number);
  const graded = sorted.filter((c) => c.sampled && c.status === "finished");
  return {
    conversations: sorted.length,
    errored: sorted.filter((c) => c.status === "errored").length,
    sampled: sorted.filter((c) => c.sampled).length,
    graded: graded.length,
    claimsMissing: graded.filter((c) => c.claims === null).length,
    ungraded: graded.filter((c) => c.verdicts.some((v) => v.ungraded) || c.claims?.status === "ungraded").length,
    rates: {
      hallucination: rate(graded.map(hallucinated)),
      policy: rate(graded.map((c) => anyFailed(c.verdicts, POLICY_RULES))),
      toolErrors: rate(graded.map((c) => anyFailed(c.verdicts, [TOOL_ERRORS]))),
      loops: rate(graded.map((c) => anyFailed(c.verdicts, [LOOP]))),
      // A missing claim check could still have flagged it.
      flagged: rate(graded.map((c) => (c.flags.length > 0 ? true : c.claims === null ? null : false))),
    },
  };
}

// The banner and the alert line: the hallucination rate itself is over the
// threshold. Not its interval: one noisy batch shows as a wide bar, not a false alarm.
export const isAlert = (rates: BatchRates, threshold: number): boolean => (rates.rates.hallucination.estimate?.value ?? 0) > threshold;
