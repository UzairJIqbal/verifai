// An online conversation in the shape of a try, so the trajectory view and the
// review queue read it the same way. Browser-safe.
import type { Step, Trial, TrialStatus } from "../results/schema";
import type { Conversation } from "./schema";

// There's no expected outcome online: a conversation "failed" when it was
// flagged, and passed when it was graded and wasn't.
export const conversationStatus = (c: Conversation): TrialStatus => (c.status === "errored" ? "errored" : c.flags.length > 0 ? "failed" : "passed");

export function conversationTrial(c: Conversation): Trial {
  const models = c.steps.filter((s): s is Extract<Step, { type: "model" }> => s.type === "model");
  return {
    taskId: c.templateId,
    category: c.category,
    difficulty: c.difficulty,
    tryNumber: c.number,
    status: conversationStatus(c),
    // The graders' end: only a step limit is told apart from a reply.
    end: c.end === null ? null : c.end === "step-limit" ? "step-limit" : "answered",
    error: c.error,
    verdicts: c.verdicts,
    calls: c.calls,
    cachedCalls: 0,
    usage: c.usage,
    costUsd: c.costUsd,
    modelLatencyMs: models.reduce((sum, s) => sum + s.latencyMs, 0),
    startedAt: c.startedAt,
    finishedAt: c.finishedAt,
    traceUrl: null,
    steps: c.steps,
    claims: c.claims,
    judge: null,
  };
}
