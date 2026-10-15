# Phase 4 — The runner and the recording

## Goal

Every task runs 4 times, a few at a time, survives the free daily limit, and leaves a full record of every step that you can read on the dashboard and in Langfuse.

## Where this starts

`pnpm eval` runs each dev task once, one after another, and prints pass or fail. Nothing is saved, and the daily limit would stop it half way with nothing to show.

## Build

- **The eval store**, a second SQLite file: runs, trials, steps, grades and the response cache.
- **A run** is one configuration (agent model, temperature, prompt version, tool-description version, dataset version) against one split, with a number of tries per task, 4 by default. The configuration is saved with the run.
- **Every step of every try is saved**: the model's message, each tool call with its inputs, each tool result or error, tokens in and out, latency, and cost worked out from tokens using prices in the config.
- **Parallel tries** with p-limit, at a concurrency set in the config.
- **The response cache**, keyed on model, temperature, the full messages, the tools and the try number. Repeating a run replays it for free.
- **A flag to skip the cache**, for measuring noise in the next phase.
- **Resume.** When the daily limit is hit, the run stops cleanly with a line saying how far it got and the command that carries on. Running it again carries on from the next unfinished try.
- **Waiting on busy providers.** A 429 (too many requests) or a 503 (provider busy) waits and retries a few times, and says it's waiting. After that, it stops cleanly like the daily limit.
- **The budget line before a run starts**: roughly how many model calls it needs per provider (Groq for the agent, Gemini for grading), how many are cached, and how many are left today on each by our own count.
- **A progress line while it runs**: tries done out of the total, passes so far, and calls used.
- **Langfuse tracing.** Each try is one trace, each step a span, tagged with the run, task, try number and versions. If the Langfuse keys aren't set, runs still work and say tracing is off.
- **Results files.** Every finished or regraded run writes `results/<run>/`: a short report in Markdown, the same report as JSON, and its trials as JSONL with their steps. Holdout trials are written as outcomes only, with no steps, until a version is promoted.
- **The runs page**: every run, newest first, with its configuration, dataset version, split, number of tries and success rate. Clicking one lists its trials, with a filter for pass and fail.
- **The trajectory page**: one try read top to bottom like the playground: customer, model, tool call with inputs, tool result, in order, with tokens and time per step. A link to the same trace in Langfuse.
- **`pnpm eval`** now runs 4 tries per dev task and prints the success rate over all tries.
- **A provider pool for the agent model.** The same model (`openai/gpt-oss-120b`) from more than one free provider, listed in the config with each provider's own limits: Groq first, Cloudflare Workers AI second, more can be added. The pacer keeps a separate budget per provider. When one provider hits its per-minute or daily limit, the next call goes to the next provider. Each step records which provider answered.
- **A smoke run** (`pnpm eval --smoke`): a fixed handful of dev tasks, one from each category, with the normal 4 tries. It's for checking that the machinery works without spending a day's free limit. A smoke run is labelled as one everywhere and is never used for a score, a comparison or a gate.

## Constraints

- **The try number is part of the cache key**, so the 4 tries stay independent of each other, but rerunning gives back the same 4.
- **A resumed run is the same run.** Same configuration, same id, and a try that finished is never redone.
- **Our SQLite store is the source of truth.** Langfuse is for looking. Nothing the stats need is read back from Langfuse.
- **The dashboard reads only the results files**, never the eval store, so it works the same on your machine and deployed later.
- **The trajectory page reuses the playground's step cards**, so a step looks the same everywhere.
- **Holdout trajectories can't be opened** until promoted. The page says why.
- **The API key never appears in a step, a trace, a results file or a log.**
- The concurrency default stays under the free tier's per-minute limit. Check the current numbers on Groq's and Google AI Studio's limits pages and put them in the config, with a comment saying when you checked.
- **The pool only ever holds the same model.** Never mix in a different model to get more quota: a run must grade one agent, not a blend. A provider joins the pool only after a one-task test shows it calls tools correctly.
- The pool's list of providers is part of the run's configuration, so two runs with different pools are never treated as the same.
- A try that errors (network, bad model output) is recorded as an errored try with the error, not dropped and not counted as a pass.

## Acceptance check

1. Run `pnpm eval --smoke`. The budget line appears first, then the progress line. It finishes with 4 tries per smoke task, and the Runs page labels it as a smoke run. Steps 2 to 8 below can use the smoke run.
1b. Start the full `pnpm eval`. It stops at the daily limit and carries on each day until all dev tasks have 4 tries. Later phases can be built while it runs.
2. Run it again with nothing changed. It finishes in seconds and uses no model calls.
3. Stop a run half way (Ctrl-C), then run it again. It carries on from where it stopped, and the total number of tries is still exactly 4 per task.
4. `results/<run>/` has the three files. The runs page lists the run.
5. From the runs page, open a failing try in two clicks. It reads like the playground, step by step.
6. Open the same try in Langfuse from its link. Every model call and tool call is there in order.
7. Remove the Langfuse keys. The run still works and says tracing is off.
8. Search the eval store, the results files and the Langfuse trace for your API key. It isn't there.

## Not in this phase

Error bars, pass^k, the flip rate, the compare page, any new grader.

## When you're done

Give me a 2 to 3 line summary of what was built in this phase.
