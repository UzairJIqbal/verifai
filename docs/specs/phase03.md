# Phase 3 — 50 tasks and the first score

## Goal

`pnpm eval` runs every dev task once and prints a success rate, the tasks page lists them, and the holdout is locked away before anyone has seen the agent fail.

## Where this starts

The agent works in the terminal and in the playground, but nothing checks whether it did the right thing.

## Build

- **The tasks file**, `evals/tasks.jsonl`, about 50 tasks. Each has an id, what the customer writes first, the canned replies the customer gives if asked something, the expected outcome, tags (category, difficulty, adversarial or not) and a split.
- **The expected outcome** is the list of database changes the task should cause (this row now has these values, this row was added), plus, where it matters, facts the reply must state or a refusal it must give.
- **The mix**: categories for cancel, refund, address change, order status questions, and transfer to a human. Easy, hard and adversarial in each: vague requests, requests the policy says to refuse, asking about someone else's order, dates right on the 14-day line, and a few where a tool returns an error.
- **The holdout split**: at least 30% of the tasks, chosen at random within each category so every category is in both splits. A lock file stores a fingerprint of the holdout tasks.
- **The task loader**: the only code that reads the tasks file. It validates every task with Zod, checks the holdout fingerprint, and returns only dev tasks unless the caller says it's gating.
- **Canned replies in the loop.** When the agent ends a turn with a question, the next canned reply is sent as the customer. When there are none left, the conversation ends.
- **The state grader.** After a try, compare the whole database with the seed, and check the changes match the expected list **exactly**: nothing missing, nothing extra.
- **The reply grader**: required facts present, required refusal given. Simple text checks, written so "Rs 1,200" and "1200 rupees" both count.
- **`pnpm eval`**: runs every dev task once, one after another, and prints each task's pass or fail and the overall success rate.
- **The tasks page** on the dashboard: dev tasks in a table with id, category, difficulty, adversarial or not, and what the customer writes. A filter by category. Clicking a task shows its canned replies and expected changes, and a button that opens it in the playground. Holdout tasks appear only as a count per category, never their content.

## Constraints

- **Write the tasks before running the agent on them.** The holdout is frozen now, before any failure has been seen, because after that every choice about it is shaped by what you saw.
- **The expected outcome is the database state, not the agent's words.** A reply that says "cancelled" with the order still processing is a fail.
- **Exact match on changes.** A correct refund plus an accidental address change fails. Side effects are the bug customers notice.
- **Changing a holdout task makes the loader refuse.** Re-freezing is a separate, deliberate command.
- Each task's expected changes are checked once by hand when written: run the correct tool calls yourself on a fresh shop, and the grader passes.
- Every task is valid against the schema, or `pnpm eval` refuses to start and names the bad line.
- The dataset starts at version `v1`, recorded in the file.
- The tasks page goes through the task loader like everything else, so it can't show the holdout by accident.

## Acceptance check

1. `pnpm eval` runs the dev tasks and prints a success rate. Note it.
2. Count the splits: at least 30% holdout, and every category appears in both.
3. Change one word in a holdout task. `pnpm eval` refuses to run and says the holdout changed. Undo it, and it runs again.
4. Break a task's JSON on purpose. The error names the line.
5. Pick a refund task, make the agent also change the address (or fake a trajectory that does), and the state grader fails it for the extra change.
6. `pnpm eval` never prints or runs a holdout task.
7. Open the tasks page. Dev tasks are listed and filterable; holdout shows counts only. Open one task in the playground with one click.

## Not in this phase

Running each task more than once, parallel runs, caching, saving trajectories, results files, any grader beyond state and reply text, error bars.

## When you're done

Give me a 2 to 3 line summary of what was built in this phase.
