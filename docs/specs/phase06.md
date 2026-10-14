# Phase 6 — Trajectory graders

## Goal

Every try gets a breakdown of how it got to its result, not just whether it got there: right tools, valid inputs, every policy rule kept, no wasted steps.

## Where this starts

Each try is graded on the final database state and the reply text, with error bars, a noise floor and a dashboard to read it on. A try that refunded without looking up the order first still passes if the database ends up right.

## Build

- **Tool choice**: precision and recall of the tools called against the task's must-call and must-not-call lists. Reported per tool across a run, so a tool the agent keeps picking wrongly stands out.
- **Argument checks**: every tool call's inputs pass the schema, and every customer id or order id in them exists in the shop.
- **Policy rules as code**, one function per rule from the project specs: identify the customer first, look up before acting, cancel and change address only while processing, refund only within the rules, large refunds to a person, confirm before cancelling or refunding, promise nothing outside the policy (the parts code can see, like "escalated" with no transfer call).
- **Efficiency**: steps taken against the task's reference, and repeated identical tool calls marked as a loop.
- **Each grader returns a verdict and a reason**, pointing at the step it's about.
- **The report** gains a per-grader section, in the terminal and on the run report page: pass rate for each grader, policy violation rate overall and per rule, tool precision and recall per tool, average steps against the reference, and loop rate. All with error bars, each linking to the trials behind it.
- **On the trajectory page**, each grader's verdict sits beside the step it points at, and a failing step is marked red. A summary row at the top lists every grader's pass or fail.

## Constraints

- **Outcome decides success.** A try succeeds when the state and reply graders pass. Trajectory graders are reported beside it, not folded into one score, so a reader can see why something failed.
- **Every grader has two tests**: a hand-built trajectory it must fail, and one it must pass. A grader that never fires looks like good news.
- **"Confirm before acting" is checked from the order of steps**: an agent message asking, a customer reply saying yes, then the tool call. A confirmation in the same message as the action doesn't count.
- **Graders are pure functions** of the trajectory and the task. Regrading an old run costs nothing and changes nothing in the run itself.
- **Regrading is its own command**, so improving a grader doesn't need new model calls.
- A grader that can't run on a try (missing data) records "couldn't grade", which shows in the report. Never a silent pass.

## Acceptance check

1. `pnpm test` passes, with a must-fail and a must-pass test for every grader.
2. Regrade the latest run. No model calls are used, and the run report page shows the per-grader section.
3. Find a try where the agent refunded without looking up the order first (or build one by hand). The look-up-first rule fails, and on the trajectory page its reason sits beside the refund step, marked red.
4. Find a try where the agent asked and acted in the same message. The confirm-first rule fails.
5. Find a try with a repeated identical tool call. It's marked as a loop.
6. The per-tool table shows a precision and recall for each of the seven tools.

## Not in this phase

Hallucination checks, the judge.

## When you're done

Give me a 2 to 3 line summary of what was built in this phase.
