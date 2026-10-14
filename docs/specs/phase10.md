# Phase 10 — Reading failures and naming them

## Goal

You've read at least 100 failed trajectories, named what went wrong in 5–10 categories, counted them, and know which one to fix first.

## Where this starts

Every try is fully graded, the judges are checked, and every failure is two clicks away on the dashboard. Nobody has read the failures and said what they have in common.

## Build

- **The review queue** on the dashboard: failed dev tries, one at a time, in random order, skipping ones already reviewed. Each shows the trajectory with its verdicts.
- **A free-text note per failure** first (what went wrong, in your words), saved to JSONL under `evals/review/`. This is the open-coding step: no categories yet.
- **The taxonomy file**: 5–10 categories, each with a name and a one-line definition, written by you after the first 50 or so notes. For example: wrong tool, wrong inputs, skipped look-up, hallucinated fact, policy break, gave up early, looped, misread the customer, task was wrong.
- **Tagging**: each note gets exactly one category, from a dropdown of the taxonomy. Notes written before the taxonomy existed are tagged in a second pass.
- **The taxonomy report**: categories sorted by count, with a share and two example trajectories each. Shown on the dashboard, and written to `docs/failure-taxonomy.md`.

## Constraints

- **Notes first, categories second.** Inventing the categories before reading means you only see failures that fit them.
- **"The task was wrong" is a category.** When the agent did the right thing and the task's expected state disagrees, fix the task, bump the dataset version, and say so in the changelog. It doesn't count as an agent failure.
- **Only dev failures.** Holdout trajectories are never reviewed.
- **One category per failure.** If two seem to fit, pick the one that happened first in the trajectory; it usually caused the other.
- Review notes and the taxonomy are committed: they're part of the evidence.
- The review queue only works locally; hidden when deployed.

## Acceptance check

1. Open the review queue. It shows a failed dev try you haven't reviewed, and moves on after you save a note.
2. After about 50 notes, write the taxonomy. The dropdown offers its categories.
3. Tag every note. None is left untagged.
4. Keep going to at least 100 reviewed failures.
5. The taxonomy report lists categories by count, each with two example trajectories you can click.
6. `docs/failure-taxonomy.md` matches the dashboard. The top category is the one to fix in Phase 11.

## Not in this phase

Fixing anything, new tasks, the gate.

## When you're done

Give me a 2 to 3 line summary of what was built in this phase.
