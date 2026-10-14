# Phase 9 — Checking the judges

## Goal

You know how far to trust each judge, as a number: "hallucination judge: TPR 0.XX, TNR 0.XX, κ = 0.XX on n = XX held-out labels of mine".

## Where this starts

The claim checker and the rubric judge give verdicts on every try. Nobody has checked whether those verdicts are right.

## Build

- **The labelling page** on the dashboard. It shows one trial at a time, picked at random from dev runs: the conversation and tool results, the rubric, and the claims. You mark pass or fail per criterion, and supported, contradicted or unsupported per claim. **The judge's verdict is hidden until you've saved yours.**
- **Labels saved as JSONL** under `evals/labels/`, with the trial, the rubric version and the time. Committed.
- **Splitting the labels once**, at random, into *judge-dev* and *judge-test*. The split is saved and doesn't change as you add labels; new labels are assigned as they're saved.
- **The agreement report**: for each judge, TPR, TNR, Cohen's κ and a confusion matrix, on *judge-test* only. On *judge-dev* too, marked as the one you tuned on.
- **Bias checks** for at least one judge: rerun it with the order of what it sees swapped, and with good replies padded with harmless extra words. Report how many verdicts changed.
- **`docs/judge-validation.md`**: generated from the agreement report, with the agreement table, confusion matrices, the bias results, and the bar you chose for "acceptable" and why.

## Constraints

- **You label before you see the judge's answer.** Seeing it first pulls your label towards it.
- **Trials are picked at random**, not chosen. Choosing the interesting ones makes the judge look worse or better than it is.
- **Only *judge-dev* is used to improve the judge.** Changing the judge's prompt, examples or model while looking at *judge-test* results is the same mistake as peeking at the holdout.
- **Labelling uses only dev-split trials.** Holdout trajectories stay unseen.
- **Write down "acceptable" before tuning.** κ above 0.6 is a common bar; whatever you pick, say why in the doc.
- The labelling page works only on your machine. On a deployed dashboard it's hidden.
- κ, TPR and TNR use the tested functions from Phase 5.

## Acceptance check

1. Label 20 trials on the page. The judge's verdict appears only after each label is saved.
2. The labels file has 20 lines, and each label is in *judge-dev* or *judge-test*.
3. Keep labelling to at least 100 trials. The agreement report prints TPR, TNR, κ and a confusion matrix per judge on *judge-test*.
4. Change the judge's prompt using *judge-dev* mistakes only, rerun, and the report shows before and after on *judge-test*.
5. Run the padding bias check. The number of changed verdicts is reported.
6. `docs/judge-validation.md` exists with the table, the matrices, the bias result and your "acceptable" bar.

## Not in this phase

The failure taxonomy, fixing the agent.

## When you're done

Give me a 2 to 3 line summary of what was built in this phase.
