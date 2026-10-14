# Phase 12 — Three iterations and the chart

## Goal

The agent has gone through at least three gated iterations, and one chart shows holdout success going up, hallucination going down and cost per success, with the failure categories shrinking underneath.

## Where this starts

The full loop exists: taxonomy, regression tasks, candidates, the gate, the changelog. It has run once at most.

## Build

- **At least three iterations** of the loop, each one: dev run, review new failures, update the taxonomy counts, new regression tasks, one candidate aimed at the top category, gate. A failed gate counts as a try, not an iteration; try the next idea.
- **The improvement page** on the dashboard, built from the promoted versions in the changelog:
  - holdout success per version, with error bars;
  - hallucination rate (response level) per version, with error bars;
  - cost per successful task per version;
  - a stacked bar of failure categories per version, so you can see which fix removed which category.
- **The chart as an image** for the README, exported from the same data.
- **Taxonomy counts per version**, so the stacked bar is real counts from reviewed failures, not estimates.

## Constraints

- **The chart shows only gated, promoted versions.** Failed candidates aren't drawn as progress, but the changelog lists them.
- **Every point carries its error bar**, and the chart says how many tasks and tries each point is from.
- **The holdout is never touched between gates.** No reading holdout failures to choose the next fix.
- **Cost uses the token counts and the price table in the config**, including judge and claim-checker calls, so cheaper-but-worse can't hide.
- Plan the free daily limit: each iteration needs a dev run, a gate run and grading. Check the budget line before each, and spread iterations across days if needed.

## Acceptance check

1. `CHANGELOG.md` has at least three promoted iterations, each with metric changes, intervals and the category it targeted.
2. The improvement page shows four charts across the promoted versions, each point with an error bar.
3. The stacked bar shows the targeted category shrinking after its fix.
4. The exported chart image matches the dashboard.
5. For one iteration, follow the chain on the dashboard: a failing dev trajectory, its taxonomy label, the candidate that fixed it, the gate that passed it.

## Not in this phase

The simulated customer and online evals, deploying.

## When you're done

Give me a 2 to 3 line summary of what was built in this phase.
