import type { AgentEvent } from "../agent/loop";
import type { RowChange } from "../shop/diff";

// Everything that happened in one try of a task: what the customer said, every
// agent step, how it ended, and how the shop differs from the seed afterwards.
export type TrajectoryEvent = { type: "customer"; text: string } | AgentEvent;

export type ConversationEnd =
  // The agent replied and the customer had no canned replies left.
  | "answered"
  // Only in dataset v1 runs: the agent asked a question (its reply had a "?")
  // and no canned replies were left. Kept so their results still read.
  | "out-of-replies"
  // A turn hit the step limit without a reply.
  | "step-limit";

export type Trajectory = {
  events: TrajectoryEvent[];
  end: ConversationEnd;
  changes: RowChange[];
};

// `step` is the index of the event the verdict is about (the same index as the
// try's recorded steps), or null when it's about the try as a whole. An
// ungraded verdict couldn't run on this try (missing data): it never passes,
// and it's counted apart from passes and fails. `spans` are the exact pieces
// of text a verdict is about (a made-up order number, "I've refunded"), each
// at the step it was written in, so the trajectory page can highlight them.
export type ValueSpan = { step: number; text: string };
export type Verdict = { grader: string; pass: boolean; reason: string; step: number | null; ungraded: boolean; spans?: ValueSpan[] };
