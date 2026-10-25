# Phase 11 — The improvement loop and the gate

## Goal

A fix to the agent is kept only if the frozen holdout says it's really better and no category got worse, and every kept fix is written down with its numbers.

## Where this starts

A taxonomy with counts and a top category to fix. Changing the prompt and rerunning is possible, but nothing decides whether a change is kept, and nothing stops a fix being shaped by the holdout.

## Build

- **New regression tasks from failures.** A command takes a reviewed dev failure and starts a new task from it, which you finish by hand (what the customer writes, the expected changes). Before saving, it's compared by embedding similarity with existing tasks, and near-duplicates are shown so you can decide. New tasks go to dev. Saving bumps the dataset version, `v1 → v2`.
- **The candidate.** A fix is a new prompt version, tool-description version, or a small validation step before a tool runs (like checking a refund amount against the order total). Each is saved as a version with a name.
- **Exemplar memory**, switchable in the config. Successful dev trajectories are stored with an embedding of their first customer message; at run time the two most similar are added to the prompt as examples.
- **The gate command.** Runs the candidate and the current promoted version on dev and holdout, then decides:
  - holdout success improved by more than the noise floor, and the paired test agrees;
  - no category dropped by more than the larger of 5 points and that category's own noise floor (scaled to its task count on that split), on dev or holdout. (Changed 2026-10-25 from a flat 5 points, decided before gate v3: measured luck moves categories 9 to 17 points. See DECISIONS.md D-002.)
  
  It prints a pass or fail table with each check, its numbers and intervals.
- **Promote.** A passing candidate becomes the promoted version. Its holdout trajectories become readable on the dashboard.
- **`CHANGELOG.md`**: the gate writes an entry on promotion: the version, what changed and why (one line from you), the taxonomy category it targeted, the metric changes with intervals, and the dataset version.

## Constraints

- **The gate is the only code that reads holdout tasks.** Regression tasks, exemplars, prompt changes and judge prompts come from dev only. The exemplar store refuses a holdout trajectory.
- **Fix the top category.** The candidate names the category it targets, and the changelog checks it was the top one in the latest taxonomy.
- **One change per candidate.** Two changes at once means you can't tell which one helped.
- **A failed gate changes nothing.** The promoted version stays, and the candidate's holdout trajectories stay hidden.
- **Both versions run on the same dataset version** for the gate. If the dataset changed, the current version is rerun first.
- The gate prints its call estimate and asks before running.
- **The holdout must be able to show an improvement.** The paired test needs at least 6 holdout tasks flipping the same way, so if the promoted version fails fewer than 6 holdout tasks, no fix can pass. Then add fresh, harder tasks (written from the policy, never from failures or the holdout), split dev/holdout by the same fixed rule, before gating. (Added 2026-10-20: v1 failed only 3 of 15.)

## Acceptance check

1. Turn one reviewed failure into a new task. A near-duplicate check runs, and the dataset version goes to `v2`.
2. Make a candidate aimed at the top category and run the gate. The table shows holdout change, paired test, noise floor and per-category drops, with a pass or fail.
3. Make a candidate that's deliberately worse (a broken tool description) and gate it. It fails, and the promoted version doesn't change.
4. Try to add a holdout trajectory to the exemplar store. Refused.
5. After a passing gate, `CHANGELOG.md` has an entry with the numbers, and the holdout trajectories of the new version open on the dashboard.

## Not in this phase

Running three iterations and the improvement chart (next phase). This phase goes through a pull request with CodeRabbit before merging: the gate is what makes every improvement claim true.

## When you're done

Give me a 2 to 3 line summary of what was built in this phase.
