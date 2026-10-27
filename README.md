# VerifAI

**A customer-support agent for a made-up phone-accessories shop, and the system that checks it:** 81 tasks (56 dev, 25 locked away as holdout; [`evals/tasks.jsonl`](evals/tasks.jsonl)), a claim checker that agrees with hand labels at κ = 0.83 (95% interval 0.00–1.00, n = 159 labels; [`docs/judge-validation.md`](docs/judge-validation.md)), and a gate that only keeps a change if the holdout gets better by more than luck could explain. κ, Cohen's kappa, is agreement beyond what chance would give; 1 is perfect. The rubric judge is at κ = 0.21 (n = 144), below the 0.6 bar, so its verdicts are reported but not trusted yet.

The promoted agent, v1, succeeds on **89.7% (83.9–94.6) of dev tries** (56 tasks × 4 tries, [run 20261023-122611-7220](results/20261023-122611-7220/report.md)) and **81.0% (66.0–94.0) of holdout tries** (25 tasks × 4 tries, [run 20261027-180017-2c62](results/20261027-180017-2c62/report.md)). Running the same configuration twice showed that a difference under 4.9 points on dev can be luck alone; that is the noise floor ([`results/noise-floors.jsonl`](results/noise-floors.jsonl)).

**No candidate has passed the gate yet.** Two were tried, and neither was promoted ([`CHANGELOG.md`](CHANGELOG.md)):

| Candidate | Change | Holdout success | Dev success | Verdict |
| --- | --- | --- | --- | --- |
| [v3](results/gates/20261027-181244-v3.json) | refund_order refuses refunds over the limit (dataset v3) | 81.0% → 83.0%, +2.0 points (+0.0 to +6.0), floor 7.3, 25 tasks × 4 | 89.7% → 92.4%, +2.7 points (−3.6 to +9.4), floor 4.9, 56 tasks × 4 | fail: within noise, no category dropped past its limit |
| [v2](results/gates/20261020-195645-v2.json) | a deliberately broken control: tools without cancel_order (dataset v2, before 31 tasks were added) | 81.7% → 71.7%, −10.0 points (−30.0 to +6.7), floor 7.1, 15 tasks × 4 | 91.4% → 79.3%, −12.1 points (−23.6 to −2.1), floor 4.6, 35 tasks × 4 | fail, as it should: cancel dropped 53.6 points on dev |

v3's fix did what it aimed at (on dev, the agent broke the refund rule in 4 of 224 tries under v1 and 0 under v3), but too few tries failed that way to move the overall rate past the noise. Further iterations of the improvement loop and the online-traffic simulation are built but haven't been run yet.

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
- **Runs.** Every task is tried 4 times, each on a fresh copy of the shop, because the agent doesn't behave the same way every time. Every model message, tool call, result, token count and latency is saved.
- **Grading.** Code first: the database changes, the facts the reply must state, the tools called, the eight policy rules, steps against the reference. An AI judge only for what code can't see (was a refusal explained, was the question answered, was the tone polite), each pass or fail against a written rubric with a one-line reason. A try succeeds when every outcome grader passes; the rest are reported beside it, not folded into one score.

## Hallucination, defined so it can be counted

- **Fabricated entity**: an order number, customer id, amount, date or email in the reply or a tool's inputs that never appeared in a tool result or the customer's messages. Found by code.
- **Fabricated action**: the reply says something happened ("I've refunded you") with no successful matching tool call. Found by code, from a fixed list of action phrases mapped to tools.
- **Unsupported claim**: a factual statement in the reply that nothing in the trajectory supports.
- **Contradicted claim**: a statement that conflicts with what the tools returned.

For the last two, the reply is split into single claims and the judge labels each one against the tool results.

For the promoted version on dev (56 tasks × 4 tries, [run 20261023-122611-7220](results/20261023-122611-7220/report.json)), averaged over tasks with 95% intervals: fabricated entities in 4.0% of tries (0.9–8.5; 9 of 224), fabricated actions in 0.9% (0.0–2.2; 2 of 224), and unsupported or contradicted claims in 3.7% of claims (1.5–6.7; 32 unsupported and 10 contradicted of 859 claims from 223 tries; one try's claims weren't checked).

## Statistics

- **pass^k** is the chance that all k tries of a task succeed: reliability, because a customer gets one try. **pass@k**, the chance at least one does, sits beside it to show the gap.
- **Error bars** come from a bootstrap over tasks: resample the tasks with replacement thousands of times, recompute, and keep the middle 95%. The random generator is seeded, so the same run always prints the same interval.
- **Comparisons are paired**: the same tasks under both versions, McNemar's exact test on per-task success, and a paired bootstrap on the difference.
- **Flip rate is the noise floor**: the same configuration run twice with the cache skipped, counting how many outcomes changed. A change smaller than that isn't called an improvement. For v1 on dataset v3 it's 4.9 points (27 of 224 paired tries flipped, 56 tasks; [`results/noise-floors.jsonl`](results/noise-floors.jsonl)).

## How the holdout is protected

About a third of the tasks (25 of 81, [`evals/holdout.lock.json`](evals/holdout.lock.json)) were locked away at the start. A lock file records their fingerprint; if one changes, every command refuses to run until it's deliberately re-frozen with a changelog line saying why. Only the gate reads holdout trajectories, and the dashboard shows holdout results as numbers only until a version is promoted. Nothing from the holdout ever goes into a fix: no prompt edit, exemplar, tool description, regression task or judge prompt.

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

A full `pnpm eval` spends about 1,100 model calls (1,109 for [run 20261023-122611-7220](results/20261023-122611-7220/report.json)). It stops cleanly at a provider's daily allowance, and running it again carries on from the next unfinished try.

Model names, temperature and limits are in [`verifai.config.json`](verifai.config.json), never in code. The system prompt and tool descriptions are versioned files under [`agent/`](agent/), and every run saves which versions it used.

## Free-tier limits

Everything runs on free plans: Groq, Cloudflare Workers AI, Gemini, Langfuse Cloud and Vercel Hobby.

| Provider | Used for | Daily allowance |
| -------- | -------- | --------------- |
| Groq | the agent | 1,000 requests and 200,000 tokens (cached input is free); 30 requests and 8,000 tokens a minute |
| Cloudflare Workers AI | the agent's second provider | 10,000 neurons, reset at 00:00 UTC |
| Gemini | the judge and claim checks | 500 requests; 15 a minute |

## The deployed dashboard

The live site is a read-only snapshot of the files in `results/`. The pages that call a model or write files (the playground, labelling, the review queue) are hidden there, and nothing on it can start a run.

## How it was built

Spec-driven, one phase at a time, each committed only after its acceptance check passed.

- [`docs/project-specs.md`](docs/project-specs.md): what the project is and the reasoning behind every decision
- [`docs/specs/`](docs/specs/): one spec per phase
- [`CHANGELOG.md`](CHANGELOG.md): every gated version, promoted or not, with its numbers

## Licence

[MIT](LICENSE).
