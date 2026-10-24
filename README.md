# VerifAI

<!--
  SKELETON. Every ‹TBD …› below is a number still to be filled in from the
  file it names. A number that has no results file behind it comes out, along
  with its sentence. Each one carries its sample size and error bar, and links
  to its evidence. Delete this comment when the last ‹TBD› is gone.
-->

**A customer-support agent for a made-up phone-accessories shop, and the system that checks it:** ‹TBD: N tasks — evidence: `evals/tasks.jsonl`›, an AI judge that agrees with hand labels at κ = ‹TBD: κ, n labels — evidence: `docs/judge-validation.md`› (κ, Cohen's kappa, is agreement beyond what chance would give; 1 is perfect), and holdout success from ‹TBD: first promoted version, % (95% CI), n tasks × k tries — evidence: `results/‹run›/report.json`› to ‹TBD: last promoted version, same — evidence: `results/gates/‹gate›.json`› over ‹TBD: N iterations — evidence: `CHANGELOG.md`›, with no category getting worse.

‹TBD: improvement chart, holdout success per promoted version with error bars — evidence: `results/gates/`›

**Live dashboard:** ‹TBD: Vercel link›. It's a read-only snapshot of the committed results; runs happen locally.

**Video (2 minutes):** ‹TBD: link›. A failing trace, its label, the fix, and the gate passing.

## How it works

A customer writes in ("cancel my order", "I want a refund", "change my address"), and the agent uses tools to look things up in the shop's SQLite database and make changes, following a written policy. The agent is deliberately plain. The grading system is the project.

Questions go in, the agent answers using the shop's database, every step is recorded, code checks the result, the failures show what to fix, and a locked test decides whether the fix really helped.

```
tasks.jsonl ──► runner ──► agent ⇄ tools ⇄ shop.db (fresh copy per try)
                  │
                  ▼
            trajectories (SQLite + Langfuse)
                  │
                  ▼
   code graders → trajectory graders → hallucination checks → AI judge
                  │
                  ▼
     report + diff (results/)  ──►  dashboard (Next.js + Recharts)
                  │
                  ▼
  read failures → name them → fix the biggest one → gate on dev + holdout
                  │                                     │
                  └──── new regression tasks ◄──────────┘
```

- **Tasks.** Each says what the customer writes and what the database must look like afterwards. The grader compares the whole database against the seed: a correct refund plus an accidental address change is a fail.
- **Runs.** Every task is tried ‹TBD: tries per task — evidence: `verifai.config.json` → `runner.triesPerTask`› times, each on a fresh copy of the shop, because the agent doesn't behave the same way every time. Every model message, tool call, result, token count and latency is saved.
- **Grading.** Code first: the database changes, the facts the reply must state, the tools called, the eight policy rules, steps against the reference. An AI judge only for what code can't see (was a refusal explained, was the question answered, was the tone polite), each pass or fail against a written rubric with a one-line reason. A try succeeds when every outcome grader passes; the rest are reported beside it, not folded into one score.

## Hallucination, defined so it can be counted

- **Fabricated entity**: an order number, customer id, amount, date or email in the reply or a tool's inputs that never appeared in a tool result or the customer's messages. Found by code.
- **Fabricated action**: the reply says something happened ("I've refunded you") with no successful matching tool call. Found by code, from a fixed list of action phrases mapped to tools.
- **Unsupported claim**: a factual statement in the reply that nothing in the trajectory supports.
- **Contradicted claim**: a statement that conflicts with what the tools returned.

For the last two, the reply is split into single claims and the judge labels each one against the tool results.

‹TBD: the four rates for the last promoted version, each with n and error bar — evidence: `results/‹run›/report.json` → `hallucination`›

## Statistics

- **pass^k** is the chance that all k tries of a task succeed: reliability, because a customer gets one try. **pass@k**, the chance at least one does, sits beside it to show the gap.
- **Error bars** come from a bootstrap over tasks: resample the tasks with replacement thousands of times, recompute, and keep the middle 95%. The random generator is seeded, so the same run always prints the same interval.
- **Comparisons are paired**: the same tasks under both versions, McNemar's exact test on per-task success, and a paired bootstrap on the difference.
- **Flip rate is the noise floor**: the same configuration run twice with the cache skipped, counting how many outcomes changed. A change smaller than that isn't called an improvement. ‹TBD: noise floor, points — evidence: `results/noise-floors.jsonl`›

## How the holdout is protected

About a third of the tasks (‹TBD: holdout count of N — evidence: `evals/holdout.lock.json`›) were locked away at the start. A lock file records their fingerprint; if one changes, every command refuses to run until it's deliberately re-frozen with a changelog line saying why. Only the gate reads holdout trajectories, and the dashboard shows holdout results as numbers only until a version is promoted. Nothing from the holdout ever goes into a fix: no prompt edit, exemplar, tool description, regression task or judge prompt.

## Stack

TypeScript (strict), the Vercel AI SDK for single model calls (the tool loop is our own, so every step is recorded), Groq for the agent and Gemini for the judge (both free tiers), SQLite through `node:sqlite`, Zod at every boundary, Vitest, Langfuse Cloud for traces, and Next.js 16 with Tailwind, shadcn/ui and Recharts for the dashboard.

## Running it locally

Needs Node 22.13 or newer and pnpm.

```bash
pnpm install
pnpm seed                    # builds the seeded shop, data/shop.db
pnpm test                    # no model calls
pnpm eval --replay           # replays the recorded trajectories and re-grades them with no key
pnpm dev                     # the dashboard, at http://localhost:3000
```

`pnpm eval --replay [runId]` replays the recorded trajectories of a committed dev run (the newest, if no id is given) and re-grades them with no key. Each try's recorded tool calls run again on a fresh copy of the shop, today's code graders mark the result, and the claim checks and judge verdicts are kept as recorded. No model is called. It prints the report with its error bars and exits with an error if any try grades differently from the committed file.

To run the agent yourself, copy `.env.example` to `.env.local` and add the keys it lists (each line says where to get one). Then:

```bash
pnpm chat                    # talk to the agent in the terminal
pnpm eval --smoke            # one task per category: checks the machinery, never a score
pnpm eval                    # the full dev split, printing success with its error bar
```

A full `pnpm eval` spends ‹TBD: model calls per full run — evidence: a finished run's `report.json` → `totals`› calls. It stops cleanly at a provider's daily allowance, and running it again carries on from the next unfinished try.

Model names, temperature and limits are in [`verifai.config.json`](verifai.config.json), never in code. The system prompt and tool descriptions are versioned files under [`agent/`](agent/), and every run saves which versions it used.

## Free-tier limits

Everything runs on free plans: Groq, Cloudflare Workers AI, Gemini, Langfuse Cloud and Vercel Hobby.

| Provider | Used for | Daily allowance |
| -------- | -------- | --------------- |
| Groq | the agent | ‹TBD — evidence: `verifai.config.json` → `agent.pool[groq].freeTierLimits`› |
| Cloudflare Workers AI | the agent's second provider | ‹TBD — evidence: `verifai.config.json` → `agent.pool[cloudflare].freeTierLimits`› |
| Gemini | the judge and claim checks | ‹TBD — evidence: `verifai.config.json` → `judge.freeTierLimits`› |

## The deployed dashboard

The live site is a read-only snapshot of the files in `results/`. The pages that call a model or write files (the playground, labelling, the review queue) are hidden there, and nothing on it can start a run.

## How it was built

Spec-driven, one phase at a time, each committed only after its acceptance check passed.

- [`docs/project-specs.md`](docs/project-specs.md): what the project is and the reasoning behind every decision
- [`docs/specs/`](docs/specs/): one spec per phase
- [`CHANGELOG.md`](CHANGELOG.md): every promoted version and why

## Licence

[MIT](LICENSE).
