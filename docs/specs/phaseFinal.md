# Phase Final — Ship it

## Goal

A reviewer opens the GitHub repository, understands what was built in one sentence, sees the improvement chart, clicks a failing trace on the live dashboard, and believes every number.

## Where this starts

Every phase is built and has passed its check. This phase adds nothing to what VerifAI does. It's about making sure what exists is on GitHub, the dashboard is live at a free address, and the project presents itself well to someone seeing it for the first time.

## Build

### Confirm GitHub is complete

- The default branch has every phase merged. No open pull requests from a finished phase, no unpushed commits.
- A clean clone installs, type-checks, passes its tests and builds, following only the README.
- No secret has ever been committed. Check the full history, not just the current files. Anything that was ever committed gets rotated, not just deleted.
- `.env.example` lists every variable the project reads, with a one-line comment each and no real values.
- The committed evidence is all there: `evals/tasks.jsonl` (versioned) and the holdout lock, the labels, the review notes, `results/` with a report per promoted version and at least one compare, `docs/failure-taxonomy.md`, `docs/judge-validation.md`, `CHANGELOG.md`.

### The live dashboard

- The repository connected to Vercel. A push to the default branch deploys.
- The deployed dashboard reads the committed results files. The pages that write (labelling, review queue) are hidden there, and nothing on it calls a model.
- A CI workflow on GitHub runs install, type-check, lint, tests and build on every pull request. No model calls in CI.

### Make it attractive

- **The README opens with the sentence from the brief, filled in with real numbers**: how many tasks, the judge's κ, holdout success from the first to the last promoted version over N iterations, and that no category regressed. Then the improvement chart, above the fold.
- Then: the live dashboard link, a short "how it works" with the data-flow diagram from the project specs, the hallucination definitions, the stats approach (pass^k, bootstrap, paired test, flip rate), how the holdout is protected, the stack, how to run it locally, and the free-tier limits.
- **A 2-minute video**: a failing trace, its taxonomy label, the fix, the gate passing. Linked from the README.
- The dashboard's home page shows the improvement chart and the headline numbers, each linking to its evidence.
- Favicon, page titles and an Open Graph image, so the link shows a proper card.
- A licence file and the repository's description, website link and topics on GitHub.

## Constraints

- **Nothing about how VerifAI works changes in this phase.** No new graders, no new metrics.
- **Every number in the README links to a results file** or a dashboard page. A number with no evidence comes out.
- **Free plans only**: Groq free tier, Gemini free tier, Langfuse Cloud free, Vercel Hobby. The README says the dashboard is a read-only snapshot and runs happen locally.
- **The deployed site never spends model calls.** A visitor can't start a run or chat with the agent.
- The dashboard follows the same interface rules as everywhere else.

## Acceptance check

1. Clone the repository fresh into an empty folder, follow only the README, add the two API keys, and `pnpm eval` runs the dev split and prints success with an error bar.
2. A secret scan of the full git history finds nothing live.
3. Open the live dashboard on a phone in a private window. The improvement chart loads, and a failing trajectory opens in two clicks.
4. On the live dashboard, the labelling page and review queue aren't reachable.
5. Every number in the README's first screen links to evidence that matches it.
6. Open a pull request with a trivial change. CI runs and passes, and uses no model calls.
7. Paste the dashboard link into WhatsApp. A proper preview card appears.
8. Watch the video. It shows the failure, the label, the fix and the gate in under two minutes.

## Not in this phase

New features. τ²-bench, eval CI on every pull request, judge ensembles, cost charts across models, adversarial task generation: stretch goals, after shipping.

## When you're done

Give me a 2 to 3 line summary of what was built in this phase.
