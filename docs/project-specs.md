# VerifAI

The product decisions behind this build, written before it starts, with the reasoning attached. The reasoning matters more than the decision — you'll hit forks this doesn't cover, and you'll need to know which way the thinking was leaning.

Read the part you need before you build something. Don't read it all at once, and don't paste it into a prompt.

## The name

*VerifAI* is "verify" and "AI" joined together, said like "verify". That's the whole project in one word. The agent says "I've refunded you" and sounds sure of itself; VerifAI checks that claim against what actually happened in the database and the tool results, and only then believes it.

Check the GitHub name is free before the first commit. Rename it then if you want, not after.

## What it is

Two things in one repository.

1. **A small customer-support agent** for a made-up online shop that sells phone accessories. A customer writes in ("cancel my order", "I want a refund", "change my address"), and the agent uses tools to look things up in the shop's SQLite database and make changes, following a written policy.
2. **The system that checks it.** It runs the agent on a fixed set of tasks, many times each, records every step it took, checks the result with code wherever code can check it, uses an AI judge only where code can't, counts hallucinations, and shows all of it on a dashboard. Then it uses the failures to make the agent better, one measured step at a time, without breaking what already worked.

**The agent is not the point.** Keep it simple. The grading system is the project. If you find yourself spending a week on the agent's prompt before the grading exists, stop: you can't tell whether a prompt change helped until the grading is there to tell you.

## In simple words: how the data moves

The short version: **questions go in, the agent answers using the shop's database, every step is recorded, code checks the result, the failures teach you what to fix, and a locked test decides whether the fix really helped.**

The longer version, as a driving test.

- **The tasks are the test routes.** A file, `evals/tasks.jsonl`, with about 50 situations. Each one says what the customer writes, and what the shop's database should look like afterwards if the agent did the right thing. ("Order 1042 is cancelled. Nothing else changed.")
- **The runner is the examiner who drives every route.** For each task it makes a fresh copy of the shop's database, gives the agent the customer's message, and lets it work: the agent thinks, calls a tool, reads the answer, calls another, and finally replies. The runner does each task 4 times, because the agent doesn't behave the same way every time.
- **The trajectory is the dashcam.** Every step is saved: what the model said, which tool it called with which inputs, what came back, how many tokens it used, how long it took. Saved in SQLite, and sent to Langfuse so you can click through it.
- **The graders are the marking sheet.** First the cheap, certain checks, written in code: is the database in the right state? Did it call the right tools? Did it break a policy rule, like refunding before looking up the order? Did it mention an order number that doesn't exist? Did it say "I've refunded you" without ever calling the refund tool? Only after those, an AI judge for things code can't see, like whether it explained a refusal politely.
- **The report is the result slip.** Success rate, reliability across the 4 tries, hallucination rate, cost, all split by category, each with an error bar, each linking to the failing trajectories.
- **The loop is the driving lesson after a failed test.** You read the failures, name what went wrong, and fix the most common problem. Then the whole test runs again. The new version is kept only if it really is better, beyond the normal run-to-run wobble, and no category got worse.
- **The holdout is the final exam you never peek at.** About a third of the tasks are locked away from the start. You never look at them while fixing the agent. They're only used to check whether a fix is real. Peeking makes every number afterwards a lie.

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

## The problem

Anyone can build an agent that works in a demo. The hard part, and the part employers can't see from a demo, is knowing **how often** it works, **why** it fails when it does, and whether a change **actually** made it better or the number just moved by luck.

Most agent projects grade only the final answer, run each task once, trust an AI judge nobody checked, and report "94% accuracy" on 20 examples they picked themselves. Every one of those is a way of fooling yourself. This project exists to show the opposite: correctness defined precisely, graders with evidence they're right, noise measured, and improvement proven on tasks the fixes never saw.

## Who it's for

Two people.

**You, the builder,** reading failing trajectories at night and deciding what to fix next. You want to click from a number to the exact trajectories behind it in two taps, and you want the tool to stop you from fooling yourself, by refusing to touch the holdout and by telling you when a change is smaller than the noise.

**The reviewer,** an engineer or hiring manager opening the GitHub repository for three minutes. They want one sentence that says what was built, one chart that shows it getting better, and a failing trace they can click on to see that the numbers are real.

This description is the test every feature gets measured against. When something tempting comes up — a fancier agent, a multi-agent setup, a big framework — the question is whether either of these two people needs it. Usually they don't. The builder wants faster, more honest feedback. The reviewer wants evidence.

## The rule everything rests on

**Every number VerifAI reports is one you could defend in an interview.**

That means every number has three things next to it: how many tasks and tries it came from, an error bar, and a link to the trajectories behind it. A success rate that went from 72% to 75% is reported as "within noise" if the noise floor is 5 points. A hallucination rate is a count of things with a written definition, not a score from a library. A judge's verdict is trusted only as far as its measured agreement with your own labels.

The reason, bluntly: the whole value of this project is that the numbers are trustworthy. One number that turns out to be cherry-picked, leaked from the holdout, or smaller than the noise makes a reviewer distrust all the others.

Pressure to break this will come from two directions. Wanting a good-looking chart pulls toward peeking at the holdout, rerunning until a lucky result appears, or quietly loosening a grader. Wanting to finish pulls toward skipping the judge validation and the noise measurement because they're slow. Both are refused.

## Scope

- **The shop**: a SQLite database with customers, products, orders, order items and refunds. Seeded once from a file in the repository, so every run starts from exactly the same shop.
- **The policy**: a short written document the agent must follow (below). Every rule in it is also written as code, so breaking it can be counted.
- **The agent**: one plain loop. Model call, tool calls, tool results, repeat, with a step limit. Seven tools.
- **The tasks**: about 50 to start, in `evals/tasks.jsonl`, each with what the customer says, the canned replies the customer gives if asked something, and the expected change to the database. Easy, hard and adversarial. A third frozen as the holdout.
- **The runner**: every task, 4 tries each, a few at a time in parallel, with a response cache and a fixed configuration. Resumable when the free-tier limit stops it.
- **Trajectories**: every step stored in SQLite and sent to Langfuse.
- **Graders**, cheapest first: database state, tool choice, argument checks, policy rules, efficiency, fabricated entities and actions, claim support, and a small AI judge.
- **Statistics**: pass^k, pass@k, bootstrap error bars, a paired test between two runs, and the flip rate between two identical runs.
- **Judge validation**: a labelling page where you mark trials yourself, and a report of how often the judge agrees with you.
- **Error analysis**: notes on failed trajectories, grouped into a failure taxonomy with counts.
- **The improvement loop**: new regression tasks from failures, a versioned dataset, a gate that decides whether a fix is kept, and a changelog.
- **Online evals, simulated**: an AI playing a customer talks to the current agent, a sample of those conversations is graded without a reference answer, and the dashboard charts it over time with an alert.
- **The dashboard**: a playground to chat with the agent, runs, reports by category, a run-to-run diff, one page per trajectory, the labelling and review pages, the improvement chart.

## Out of scope, and why

Each of these is something a model will propose, because each of them sounds like an improvement. The reason matters more than the refusal.

- **A clever agent.** Planning modules, memory, multi-agent setups, a framework like LangGraph. The agent exists to be graded. A simple agent fails in ways you can read and name; a clever one fails in ways you can't.
- **An agent framework's built-in loop.** The Vercel AI SDK can run the whole tool loop for you. Don't use that part. Write the loop yourself and call the model one step at a time, so every step is yours to log and nothing happens between steps that you didn't record.
- **An eval framework** (promptfoo, DeepEval, Inspect, Braintrust). The runner, graders and report are the project. Using a framework for them is skipping the part you're building to show.
- **1–10 scores from the judge.** A score of 7 means nothing you can check. Every judged criterion is pass or fail, with a written rubric and a one-line reason.
- **A "hallucination score" from a library.** Hallucination here is four things with written definitions, counted.
- **DSPy and automatic prompt optimisation.** DSPy is Python, and this is a TypeScript project. Hand changes to the prompt and tool descriptions, measured by the gate, are allowed by the brief and are enough. Exemplar memory (below) is the one automatic improvement, because it's small and easy to explain.
- **Fine-tuning a model.** Needs paid compute and belongs to a later project.
- **A public chat page for the agent.** Every message costs requests from the same free daily limit the evals need, exactly the lesson Flowlens taught. The playground exists, but only on your machine. The "deployed agent" in this project is the promoted agent version, and the simulated customer talks to it through the same entry point a chat page would use.
- **Running τ²-bench.** It's Python. A stretch goal at most, after Phase Final.
- **Eval CI on every pull request.** A full run is hundreds of model calls; on the free tier that can't run on every push. A stretch goal at most.
- **A hosted database.** The shop and the eval store are SQLite files. Nothing needs to be shared between machines.
- **Queues, workers, a separate backend.** One repository: a Next.js app for the dashboard, and command-line scripts that share its code.

## The stack, and why

Your list, with the reasoning for each and four small changes.

- **TypeScript, strict.** One language for the agent, the graders, the stats and the dashboard.
- **Two free providers: Groq for the agent, Gemini for the judge.** *Change (decided 2026-10-14):* the agent and the simulated customer run on a fast Groq model with tool calling; the judge and the claim checker run on a Gemini model. Each model and its provider is set in one config file, never in the code. Two providers means two separate free daily limits instead of one shared one. And a judge from a different company is less likely to go easy on the agent's style; the judge validation measures how much bias is left. Either side can be moved to the other provider by changing the config.
- **A provider pool for the agent** (added 2026-10-14, Phase 4). Groq's free tier allows 200K counted tokens a day, and its prompt cache only hits about half the time, so a full run would take about 3 days. The same gpt-oss-120b model is also free on Cloudflare Workers AI (a daily allowance of "neurons"), so the runner spreads calls across both, moving to the next provider when one is at its limit. Only the same model is ever pooled; mixing models would grade a blend, not one agent.
- **Vercel AI SDK** for calling Groq and Gemini (one provider package each) and describing tools with Zod schemas. Only for the model call. The loop is yours (see "Out of scope").
- **SQLite through Node's built-in `node:sqlite`.** *Change:* the built-in module, not a package like `better-sqlite3`, so nothing native has to compile on your Mac. It needs Node 22.13 or newer. If it turns out to be missing something you need, say so and `better-sqlite3` is the fallback. Two database files: `shop.db`, the agent's world, copied fresh for every try; and the eval store, holding runs, trials, steps, grades and the response cache.
- **p-limit** to run a few tries at once without going over the rate limit.
- **Langfuse, not Phoenix.** *Change:* pick one, and Langfuse Cloud's free plan needs nothing installed, while Phoenix wants Python or Docker running on your machine. It's for clicking through traces. Your own SQLite store stays the source of truth, because the stats need to query it and a free plan can change.
- **Next.js 16 and Recharts** for the dashboard. Tailwind v4 and shadcn/ui, the same as your other projects.
- **Zod** for tool inputs, the tasks file, labels and config. *Addition.*
- **Vitest** for the stats and grader functions. *Addition.* The stats are the part most likely to be quietly wrong, and they're pure functions, so they're cheap to test.
- **tsx** to run the scripts. *Addition.*
- **No `scipy` or `numpy`.** The brief's statistics are in Python. Here they're a few small, tested TypeScript functions: no stats library needed for pass^k, bootstrap, McNemar and Cohen's κ.
- **`pnpm eval`, not `make eval`.** pnpm scripts work the same on every machine with no extra tool.
- **Gemini's embedding model** for spotting duplicate regression tasks and for exemplar memory. Uses the Gemini key.
- **Vercel Hobby** for the read-only dashboard in Phase Final. It's a portfolio project, so Hobby's non-commercial rule is fine.

**The free tier is the biggest constraint in this project.** A full run is roughly: 50 tasks × 4 tries × about 5 model calls each = about 1,000 agent calls on Groq, plus judge and claim-checker calls on Gemini. Both free tiers have a per-minute limit and a per-day limit for each model (Flowlens hit Gemini's daily one), and both get busy at times. Check the current numbers on Groq's and Google AI Studio's rate-limit pages before Phase 4, because they change. The design handles it in four ways:

1. **The response cache.** Rerunning the graders on an existing run costs nothing. Only a changed prompt or tool description costs new calls.
2. **Resumable runs.** When the daily limit hits, the run stops cleanly, and tomorrow's command carries on from the next try. A 429 (too many requests) or a 503 (provider busy) waits and retries a few times, saying so.
3. **A daily budget counter per provider** printed before a run starts: "this run needs about 1,000 Groq calls and 100 Gemini calls; 640 and 400 left today". Nothing starts that can't finish without saying so.
4. **Development runs on the dev split only.** The holdout runs only when gating a fix.

If waiting days per iteration becomes the bottleneck, the escape hatch is a paid key on either provider, with billing on and a hard spending cap of a few dollars. That's your call to make, not the code's. Nothing in the design depends on it.

## How it works

No folder names here — the structure is yours to choose. These are constraints on behaviour.

### The shop

**The shop has a frozen clock.** "Today" in the shop is a fixed date stored in the database, not the computer's date. The 14-day refund rule has to give the same answer next month as it does today, or every task about it breaks silently.

**Money is whole rupees, stored as integers.** No floats. Shown as `Rs 1,200`.

**Every try gets a fresh copy of the seeded shop.** Two tries never share a database, so one try's refund can't leak into another's starting state.

**The seed is a file in the repository.** Running it gives the same shop, byte for byte, every time.

### The policy

The agent's system prompt includes this policy. Each rule is also a function that reads a trajectory and says whether the rule was broken.

1. **Identify the customer first.** Before looking at or changing an order, the agent finds the customer by the email they give, and only acts on that customer's orders.
2. **Look before acting.** Before cancelling, refunding or changing an address, the agent looks up that order in the same conversation.
3. **Cancel only while processing.** Shipped or delivered orders can't be cancelled.
4. **Change an address only while processing.**
5. **Refund only delivered orders, within 14 days of delivery**, and never more than the order total minus anything already refunded.
6. **Large refunds go to a person.** A refund over Rs 10,000 is transferred to a human, not issued.
7. **Confirm first.** Before cancelling or refunding, the agent says exactly what it's about to do and waits for the customer to say yes.
8. **Promise nothing the policy doesn't allow.** No discounts, no coupons, no "I've escalated this" without calling the transfer tool.

### The agent

**Seven tools**: find a customer by email, list a customer's orders, get one order, change an order's address, cancel an order, refund an order, transfer to a human. Each tool's input is a Zod schema; each tool returns plain JSON, or a clear error the model can read ("order 1042 is shipped and can't be cancelled").

**The loop**: send the conversation and tools to the model, run whatever tools it asked for, add the results, repeat. Stop when the model replies without asking for a tool, or at 12 steps. When the model's reply is a question to the customer, the runner gives it the task's next canned reply; when there are none left, the conversation ends.

**Canned replies instead of an AI customer, offline.** A task says what the customer replies if asked ("yes, go ahead"). That keeps offline runs deterministic and free. The AI-played customer is only used for online evals in Phase 13.

**Tool descriptions and the system prompt are versioned files.** Each run records exactly which version it used. Tool descriptions are often the biggest lever for improving an agent, so they're treated as something the improvement loop changes, not as code.

### Tasks and the holdout

**A task** has an id, what the customer writes, the canned replies, the expected outcome, tags (category, difficulty, and whether it's adversarial), and its split (`dev` or `holdout`). The expected outcome is:

- **The expected changes to the database**, as a list: this row in this table has these values afterwards; this row was added. The grader compares the whole database against the seed and checks the changes match **exactly**. A correct refund plus an accidental address change is a fail.
- **Optionally, tools that must or must not be called**, and the reference number of steps.
- **Optionally, facts the reply must state** (the refund amount, the delivery date) or a refusal it must give.

**The mix**: easy (one clear request), hard (two orders, partial refunds, dates near the 14-day line), and adversarial (vague requests, requests the policy says to refuse, someone asking about another person's order, a tool returning an error).

**The holdout is frozen at the start**, at least 30% of the tasks, spread across categories. A lock file records a fingerprint of the holdout tasks. If a holdout task changes, every command refuses to run until you deliberately re-freeze it, and the changelog says why.

**Nothing derived from the holdout is used in a fix.** Not exemplars, not prompt edits, not judge prompts, not regression tasks. Only one command reads holdout trajectories: the gate. The dashboard shows holdout results as numbers only, never as trajectories you can read, until a version is promoted.

**The dataset is versioned.** Adding regression tasks bumps it (`v1 → v2`), and every run records which version it used. Comparing two runs on different dataset versions compares only the tasks they share, and says so.

### Running and recording

**A run** is one configuration (agent model, temperature, prompt version, tool-description version, dataset version) against one split, 4 tries per task. The configuration is saved with the run.

**Every try is recorded in full**: each model message, each tool call with its inputs, each tool result or error, tokens in and out, latency, and cost (worked out from tokens, even on the free tier, so cost per success can be compared across versions).

**The response cache** is keyed on everything that changes a model call: model, temperature, the full messages, the tools, and the try number. The try number is in the key so the 4 tries stay different from each other, but repeating a run replays the same 4. **A flag skips the cache**, because measuring noise needs genuinely fresh calls.

**Flip rate is the noise floor.** Run the same configuration twice with the cache skipped and count how many (task, try) outcomes changed. That number, turned into "a change smaller than X points isn't real", is shown on every comparison.

### Grading

Cheap and certain first. An AI judge only for what code can't check.

1. **Outcome graders (code)**: database changes match exactly; the reply states the facts it must; a required refusal happened.
2. **Trajectory graders (code)**:
   - *Tool choice*: precision and recall of the tools called against the task's must-call and must-not-call lists, per tool, to find confusing tool descriptions.
   - *Arguments*: every call's inputs pass its schema, and every order or customer id in them is real.
   - *Policy*: each of the eight rules as a function.
   - *Efficiency*: steps against the reference, and repeated identical calls (loops).
3. **Hallucination checks** (below).
4. **The AI judge**, for a few things only: was a refusal explained, did the reply answer what was asked, was the tone polite. Each is pass or fail against a written rubric, with a one-line reason.

**A trial succeeds when every outcome grader passes.** The other graders are reported beside it, not folded into one score, so you can see why it failed.

### Hallucination, defined so it can be counted

- **Fabricated entity**: an order number, customer id, amount, date or email in the reply or in a tool's inputs that never appeared in any tool result or in the customer's messages. Found by pulling those values out and comparing. Code, no AI.
- **Fabricated action**: the reply says something happened ("I've refunded you", "I've cancelled it", "I've passed this to the team") with no successful matching tool call. Code, with a fixed list of action phrases mapped to tools.
- **Unsupported claim**: a factual statement in the reply that nothing in the trajectory supports.
- **Contradicted claim**: a statement that conflicts with what the tools returned.

For the last two, the reply is split into short single claims, and each one is labelled *supported*, *contradicted* or *unsupported* against the tool results, by the judge model.

**The report shows four rates**: responses with at least one unsupported or contradicted claim; unsupported claims out of all claims; trials with a fabricated entity; trials with a fabricated action. Each links to examples.

### Statistics

All of these are small pure functions with tests.

**pass^k and pass@k**, per task from its *n* tries and *c* successes, then averaged across tasks:

```ts
// n choose k, exact for the small numbers here.
function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

// Probability all k sampled tries succeed (τ-bench's pass^k). Reliability.
export const passHatK = (n: number, c: number, k: number) => comb(c, k) / comb(n, k);

// Probability at least one of k sampled tries succeeds. Potential, not reliability.
export const passAtK = (n: number, c: number, k: number) => 1 - comb(n - c, k) / comb(n, k);
```

pass^k is the headline, because a customer gets one try. pass@k sits next to it to show the gap.

**Error bars by bootstrap over tasks**: resample tasks (not tries) with replacement a few thousand times, recompute the metric each time, and take the middle 95%. The random generator is seeded, so the same run always prints the same interval. With 50 tasks and around 50% success, expect roughly ±14 points. That's why the noise floor and the paired test matter.

**Comparing two versions is paired**: the same tasks under both. McNemar's exact test on per-task success (a task counts as a success if the majority of its tries passed), plus a paired bootstrap on the difference. A comparison prints the difference, its interval, the p-value, and whether it's bigger than the flip-rate noise floor.

**Judge agreement**: true positive rate (it catches real failures), true negative rate (it doesn't flag good ones), and Cohen's κ against your labels.

**Fix the task set and the number of tries before looking at results.** Rerunning until a good number appears is the same as cherry-picking.

### Judge validation

**You label trials yourself** on a page in the dashboard: pass or fail per judged criterion, and supported or not per claim, against the same written rubric the judge uses. 100–200 trials, picked at random from dev runs, not chosen.

**Your labels are split once**: *judge-dev*, which you may look at while improving the judge's prompt, and *judge-test*, used only to report agreement. The same holdout idea, applied to the judge.

**Bias checks**: on at least one judge, swap the order of what it compares, and pad good answers with harmless extra words. If its verdicts move, that's reported.

**Acceptable agreement is a number you choose and write down** before tuning, with your reason. κ above 0.6 is a common bar.

### The improvement loop

One iteration:

1. **Collect** failures from the latest dev run, and from online traces flagged in Phase 13.
2. **Triage**: each one gets a taxonomy category, in the review queue on the dashboard.
3. **Grow the dataset**: each new failure mode becomes at least one new task, written by you, checked against existing tasks for near-duplicates by embedding similarity. New tasks go to dev. The dataset version goes up.
4. **Fix the top category**, with one of: a prompt change, a tool-description change, exemplar memory, or a validation step before a tool runs (like checking a refund amount against the order total).
5. **Gate**: run dev and holdout with the fix. It's promoted only if holdout success improved by more than the noise floor and the paired test agrees, **and** no category dropped by more than the threshold you set (say 5 points).
6. **Record** a `CHANGELOG.md` entry: what changed, why, the metric changes with intervals, and the dataset version.

**Exemplar memory**: successful dev trajectories are stored with an embedding of their first customer message. At run time, the two most similar are added to the prompt as examples. Only dev trajectories, ever.

**Continuous learning here means this loop**, not the model learning on its own. Nothing changes the agent without passing the gate.

### Online evals, simulated

**The simulated customer** is the cheap model given a persona and a goal, taken from task templates, talking to the current promoted agent on a fresh shop copy.

**Reference-free graders** run on a sample of those conversations: fabricated entities and actions, policy rules, tool errors, loops, and the claim checker. There's no expected answer online, so outcome graders don't apply.

**The dashboard charts these over time**, and shows a red banner when the hallucination rate goes over a threshold you set. Flagged conversations land in the review queue.

### Files are the record, SQLite is the workshop

**After every run, the results are written to `results/<run>/`**: a report in Markdown, the same report as JSON, and the trials as JSONL. These are committed to git.

**The dashboard reads those files**, not the database (the playground is the one exception, and it only runs on your machine), so it works the same on your machine and deployed on Vercel. The labelling page and review queue write their output to JSONL files under `evals/`, which are committed too: your labels and taxonomy are part of the evidence. On the deployed site, the pages that write are hidden.

**Secrets never go in a trajectory.** The API key is never in a log, a results file, a commit or a Langfuse trace.

## The interface

A working tool for one person, and a showcase for a reviewer.

**Numbers always carry their evidence.** Every metric shows its error bar and how many tasks and tries it's from, and is a link to the trajectories behind it.

**The trajectory page reads top to bottom like a conversation**: customer message, model reply, tool call with inputs, tool result, and so on. Each grader's verdict sits next to the step it's about. A policy break highlights the step that broke it.

**Colour carries meaning or it isn't there.** Green for pass, red for fail, amber for "within noise". One blue accent for links. Everything else greyscale. Charts follow the same palette.

**Monospace for ids, numbers and tool inputs**, so `0` and `O` can't be confused.

**Dark and light, and the user's choice wins.** Follow the system, force light, force dark. Survives a reload.

**Nothing moves on its own.** No animated charts, no auto-refreshing panels.

**Smooth means no dead ends.** Every page has an empty state that says what to run to fill it, a loading state, and plain-word errors that say what to do next. The terminal commands follow the same rule: a run that stops says why and what command carries on.

**The playground comes first.** A chat box where you talk to the agent and watch every step appear: its message, each tool call with inputs, each result. It's the friendliest way to see the agent work, and it stays useful all project long for trying one case by hand instead of spending a full run.

**The shell gets built once**, in Phase 2: header, theme control, and places for the playground, tasks, runs, run report, compare and trajectory. Later phases fill those places and add pages; they don't rearrange them.

## The phases

Foundations first, then the UI, then one layer of checking at a time. Each phase leaves something you can run or open.

1. **The shop and the agent.** The database, the policy, seven tools, the agent loop, and a chat in the terminal.
2. **The UI.** The dashboard shell and the playground: chat with the agent in the browser and watch every step.
3. **Tasks and the first score.** About 50 tasks, the holdout locked away, `pnpm eval`, and a tasks page.
4. **The runner and the recording.** 4 tries per task, in parallel, cached, resumable, traced in Langfuse, saved as results files, with runs and trajectory pages.
5. **The noise floor and the statistics.** Error bars, pass^k, the flip rate, and the compare page. *Pull request.*
6. **Trajectory graders.** Right tools, valid inputs, policy rules, wasted steps.
7. **Hallucination checks.** Four kinds, each defined and counted.
8. **The AI judge.** Pass or fail, for what code can't check.
9. **Checking the judges.** Your labels against the judge's, as numbers.
10. **Reading failures.** The review queue and the failure taxonomy.
11. **The improvement loop and the gate.** Regression tasks, candidates, the gate, the changelog. *Pull request.*
12. **Three iterations and the chart.**
13. **Online evals.** A simulated customer, graded without an answer key.
14. **Phase Final.** GitHub complete, the dashboard live on Vercel, the README and the video.

Phases 5 and 11 go through a pull request with CodeRabbit, because a bug in the statistics or the gate makes every later number wrong. The rest commit straight to main after the acceptance check.

## Where this is likely to go wrong

**The free daily limit.** The single most likely thing to stall this project. Resume, cache and the budget counter exist for it. If you catch yourself rerunning full suites to check small things, run one task instead.

**Peeking at the holdout.** It happens by accident: opening a holdout trajectory to "just see why it failed". The tooling refuses, and the rule is in AGENTS.md, because once it happens the improvement chart means nothing.

**Tasks that are wrong.** A task whose expected state is itself a mistake makes the agent look worse for being right. When reading a failure, the first question is always "is the task correct?" A fixed task bumps the dataset version.

**A grader that's wrong in the agent's favour.** A policy check with a bug that never fires reads as "no violations", which looks like good news. Every grader gets a test with a trajectory that should fail it.

**Noise read as progress.** The agent model isn't fully repeatable even at temperature 0. A 3-point gain on 50 tasks is very likely noise. The flip rate exists so every comparison says so.

**The judge grading itself.** If the judge model is too close to the agent model, it likes the agent's style. Different models, plus the agreement numbers, keep this honest.

## What has to be true before this ships

Not "it looks right". Specifics:

- `pnpm eval` on a fresh clone, with only the two API keys added, runs the dev split and prints success with an error bar.
- Changing a holdout task makes every command refuse to run.
- No fix, exemplar, regression task or judge prompt was derived from the holdout, and the code makes that hard rather than just asking nicely.
- Every grader has a test with a trajectory it must fail, and a test with one it must pass.
- The flip rate between two identical runs is measured and shown on every comparison.
- The judge's TPR, TNR and κ on held-out labels are in `docs/judge-validation.md`, with a confusion matrix.
- `docs/failure-taxonomy.md` has 5–10 categories with counts and two example traces each.
- `CHANGELOG.md` has at least three gated iterations, each with metric changes and intervals.
- The README opens with the improvement chart, and every number in it links to a results file.
- A deliberately broken tool description shows up on the online dashboard and lands in the review queue.
