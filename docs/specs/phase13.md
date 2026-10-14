# Phase 13 — Online evals with a simulated customer

## Goal

An AI playing a customer talks to the promoted agent, a sample of those conversations is graded without any answer key, and a regression you introduce on purpose shows up on the dashboard and lands in the review queue.

## Where this starts

Offline evals with an answer key for every task, and three gated iterations. Nothing watches the agent on conversations it hasn't seen before.

## Build

- **The simulated customer**: the agent-side Groq model from the config, given a persona (patient, angry, vague, pushy about a refund) and a goal taken from a task template. It talks to the promoted agent on a fresh shop copy until its goal is met, it gives up, or 8 turns pass.
- **The traffic command**: generates a batch of simulated conversations, a number set in the config, and saves them as online traces with a timestamp.
- **Sampling**: a share of traces (set in the config) is graded.
- **Reference-free graders on the sample**: fabricated entities and actions, the policy rules, tool errors, loops, and the claim checker. No outcome graders, because there's no expected answer.
- **Flagging**: any sampled trace failing a policy rule or with a fabricated entity, fabricated action or unsupported claim goes into the review queue, marked as online.
- **The online page** on the dashboard: these rates over time, one point per batch, with error bars. A red banner when the hallucination rate goes over the threshold in the config.

## Constraints

- **Online traces are dev-side data.** Flagged ones can become regression tasks in the loop. They never go into the holdout.
- **The simulated customer never sees the agent's prompt, tools or the task's expected outcome.** Only its persona and goal.
- **The online page reads results files** like the rest of the dashboard: each batch writes its own.
- **Traffic spends model calls on both sides**, customer and agent. The command prints its estimate and asks first.
- **The traffic command can target a named candidate** instead of the promoted version, for testing that regressions show up. That never promotes it.
- The alert is the banner and a line in the command's output. No email or push service.

## Acceptance check

1. Run a batch of traffic. Conversations are saved, a sample is graded, and the online page shows a new point.
2. Open a flagged online conversation in the review queue. It's marked online and shows why it was flagged.
3. Make a candidate with a broken tool description on purpose (say, tell it refunds don't need a look-up), and run another batch against that candidate instead of the promoted version. The policy violation rate jumps on the online page, the banner shows if hallucination crossed the threshold, and the flagged traces are in the review queue.
4. Run one more batch against the promoted version. The rates fall back.

## Not in this phase

A public chat page, real users, running traffic on a schedule.

## When you're done

Give me a 2 to 3 line summary of what was built in this phase.
