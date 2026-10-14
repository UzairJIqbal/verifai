# Phase 5 — The noise floor and the statistics

## Goal

You can say, with numbers, "identical runs disagree on X% of outcomes, so a change smaller than Y points isn't real", and every result on the dashboard comes with an error bar.

## Where this starts

Runs of 4 tries per task, fully recorded and readable on the dashboard. The success rate is one number with no idea of how much it would wobble if you ran it again.

## Build

- **The statistics module**, pure functions with tests:
  - pass^k and pass@k per task from its tries, averaged across tasks, for k from 1 to the number of tries. (pass^k: the chance all k tries succeed. pass@k: the chance at least one does.)
  - A bootstrap error bar over tasks: resample tasks (not tries), recompute, take the middle 95%. Seeded.
  - A paired comparison of two runs on the tasks they share: McNemar's exact test on per-task success (a task passes if most of its tries did), and a paired bootstrap on the difference.
  - Flip rate between two runs of the same configuration: the share of (task, try) outcomes that changed.
  - Cohen's κ, true positive rate and true negative rate, for Phase 9. Tested now, with the rest.
- **The noise command.** Runs the dev split twice with the cache skipped and the configuration unchanged, then prints the flip rate and the smallest change it would take to be bigger than noise. The result is saved as the noise floor for that configuration.
- **The run report**, in the terminal and in the results files: success rate with its error bar, pass^1 to pass^4 and pass@1 to pass@4, all with the number of tasks and tries. Split by category and by difficulty.
- **The run report page** on the dashboard: the headline numbers, then per category and per difficulty. Every number links to a filtered list of the trials behind it. A Recharts bar chart of success by category, with error bars. The runs page gains error bars and pass^4.
- **The compare command and page**: two runs side by side, per category, with the difference, its interval, the p-value, and a plain verdict: better, worse, or within noise. The noise floor is shown at the top.

## Constraints

- **Resample tasks, not tries.** Tries of one task aren't independent of each other; resampling them makes the interval look tighter than it is.
- **Seeded randomness.** The same run always prints the same interval.
- **Every function has a test against a known answer**: pass^k on small hand-worked cases, McNemar against a textbook example, κ against a worked example, bootstrap reproducible from a seed.
- **A comparison between runs with different configurations or dataset versions says so**, and compares only the tasks both have.
- **Within noise is a verdict, not a footnote.** A difference smaller than the noise floor is shown as "within noise", in amber, even if it's positive.
- **Every number shows its sample size and error bar**, and is a link.
- The noise command spends real model calls. It prints its estimate and asks before starting.
- No stats package. These are a few dozen lines of tested code.
- Charts use the status colours and greyscale only, with no animated transitions.

## Acceptance check

1. `pnpm test` passes, including the hand-worked pass^k, McNemar and κ cases.
2. Run the noise command. It prints a flip rate and "changes smaller than N points are noise". Write both down.
3. Open the same run report twice. The error bars are identical.
4. pass^4 is lower than or equal to pass^1, and pass@4 higher than or equal to pass^1. If not, something is wrong.
5. Click a category's success rate on the report page. You see exactly the trials behind it.
6. Compare the two noise runs. The page says "within noise" and shows the noise floor.
7. Compare a run with a deliberately broken tool description against a normal run. The verdict is "worse", with an interval that doesn't cross zero.

## Not in this phase

Trajectory graders, hallucination checks, the judge. This phase goes through a pull request with CodeRabbit before merging: a bug here makes every later number wrong.

## When you're done

Give me a 2 to 3 line summary of what was built in this phase.
