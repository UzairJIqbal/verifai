# Phase 8 — The AI judge, for what code can't check

## Goal

A small set of qualities code can't see are judged pass or fail against a written rubric, with a one-line reason, and nothing code can check is left to the judge.

## Where this starts

Outcome, trajectory and hallucination graders. Nothing checks whether a refusal was explained, whether the reply answered what was asked, or whether it was polite.

## Build

- **The rubric file**, versioned like the prompt: three criteria to start.
  - *Refusal explained*: when the agent refused, it said which rule and what the customer can do instead.
  - *Answered the question*: the reply addressed what the customer actually asked.
  - *Tone*: polite and plain, no blame, no over-apologising.
  
  Each criterion says what a pass is, what a fail is, and gives one example of each.
- **The judge**: one call per try, the judge model from the config, returning pass or fail per criterion with a one-line reason each.
- **Criteria apply only where they make sense.** *Refusal explained* runs only on tries where the agent refused.
- **The report and the trajectory page** show judge verdicts in their own section, separate from outcome success, with the rubric version.

## Constraints

- **Pass or fail only.** No 1–10 scale, no "partially".
- **Nothing code can check goes to the judge.** If a criterion turns out to be checkable with code, it moves to a code grader.
- **The judge sees the conversation and the tool results**, not the task's expected answer, so it judges the reply, not whether it matches a key.
- **The judge doesn't decide success.** Its verdicts are reported beside it.
- The judge's output is validated with Zod; a malformed answer is "couldn't grade".
- Judge calls are cached like agent calls, keyed on the rubric version too.

## Acceptance check

1. Run the judge on the latest run, after its call estimate. Each try has a verdict and a reason per criterion that applies.
2. Open a refusal trajectory. *Refusal explained* has a verdict and a reason you can check by reading the reply.
3. A non-refusal trajectory has no *Refusal explained* verdict.
4. Change one word in the rubric. The judge reruns (the cache misses) and the report shows the new rubric version.
5. Pick five verdicts at random and read the trajectories. Write down how many you agree with. That number is the reason for the next phase.

## Not in this phase

Checking the judge against your own labels, bias checks, changing the judge to improve agreement.

## When you're done

Give me a 2 to 3 line summary of what was built in this phase.
