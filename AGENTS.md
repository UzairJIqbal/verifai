# VerifAI

A small customer-support agent for a made-up phone-accessories shop, and the
system that checks it. The agent answers customers using tools over a SQLite
database and a written policy. VerifAI runs it on a fixed set of tasks many
times, records every step, checks the results with code wherever it can,
counts hallucinations, and uses the failures to make the agent better without
breaking what already worked. Every number it reports is one you could defend
in an interview.

Why any of these rules exist is in `docs/project-specs.md`. This file is the
rules themselves.

## Stack

TypeScript strict. Groq (free tier) for the agent and Gemini (free tier) for
the judge, both through the Vercel AI SDK, for the model call only. SQLite through Node's built-in `node:sqlite` (Node 22.13 or
newer). p-limit for running tries in parallel. Langfuse Cloud for viewing
traces. Zod at every boundary. Vitest for tests. tsx for scripts. Next.js 16
App Router, React 19, Tailwind v4, shadcn/ui and Recharts for the dashboard.
pnpm.

Next.js 16 and the Vercel AI SDK both change often. If you're not certain
about an API, read the docs inside the installed package rather than going
from memory. Same for Langfuse's tracing setup and Groq's and Gemini's model
names: follow their current docs, not an old snippet.

## How we work

Spec driven. Nothing gets built without a spec.

- `docs/project-specs.md` — what this project is and every decision behind it.
  Read the part you need. Don't ask me to paste it.
- `docs/specs/phaseNN.md` — one per phase. Behaviour and an acceptance check,
  never filenames.
- This file — always true, read on every prompt.

**Starting a phase.** Read this file and that phase's spec. Build what the spec
asks and stop.

**Dropped into a fresh context and don't know where we are?** Look at which
files exist in `docs/specs/`, then the git log. The last commit is the last
phase that passed. Tell me what you've worked out before building on it.

**Finishing a phase.** After I've run the acceptance check, commit the phase
as one commit and push it straight to main. Two exceptions: Phase 5 (the
statistics) and Phase 11 (the gate) go on their own branch as a pull request,
and I merge them after CodeRabbit's review is clean. A bug in either makes
every number afterwards a lie.

**End every phase with a 2 to 3 line summary** of what was built in it, in
plain words. Every phase spec ends by asking for it. No file lists, no plan
for the next phase.

**The acceptance check is mine to run, not yours.** It's a list of commands I
run and pages I open. Build so those things are true, then tell me it's ready.

**What you check before saying a phase is done:** types, lint, tests, build.
Anything verifiable from a terminal in a few seconds is yours. Anything that
spends model calls from the free daily limit is mine, unless I say otherwise:
tell me the command and roughly how many calls it needs.

**When a phase comes out wrong, I reset rather than patch.** Prompting on top of
wrong code three times leaves code nobody understands, including you. So if a
spec is ambiguous, say so _before_ you build.

## How to talk to me

Short. If a sentence isn't telling me something I need, cut it.

**Ask with an answer attached.** One specific question, and say which way you'd
go and why. "A or B, I'd take B because the grader stays deterministic" is
answerable in two seconds. An open question isn't. Never pick a direction
silently, never build both.

**When you need something only I can give you** — an API key, a value in
`.env.local`, a setting in Langfuse, Groq or Google AI Studio — say exactly what and
exactly where, then stop.

**No walls of text.** Don't summarise every file you touched or restate the plan
back to me. When a phase is done, the 2 to 3 line summary is enough.

**Simple words.** I'm still learning. If you use a term like pass^k, bootstrap
or κ for the first time in a phase, say what it means in one short sentence.

**Plain English.** If you're reaching for a bulleted breakdown of something
that's one sentence, it's one sentence.

**Say when something didn't work.** A failure worked around quietly costs me an
hour later. A grader that quietly stopped running costs me a wrong chart.

## How the code is laid out

You pick the file structure. These are about behaviour.

- **One repository, one package.** The dashboard is a Next.js app; the runner,
  graders and loop are command-line scripts that share its code. No separate
  backend, no workers, no queues.
- **The UI comes early and grows.** The shell and the playground are built in
  Phase 2. Every later phase adds its page inside that shell, so what you build
  is something you can see the same day.
- **Pages that spend model calls or write files work only on my machine**: the
  playground, labelling and the review queue. On the deployed site they're
  hidden, and nothing there can call a model.
- **The agent loop is ours.** The AI SDK makes one model call at a time. It
  never runs the tool loop on its own, so every step is ours to record.
- **One function loads tasks**, and it's the only way to read them. Asking it
  for the holdout requires saying you're gating. Nothing else opens the tasks
  file.
- **Model names, temperature and limits live in one config file**, never in
  the code. A run saves the config it used.
- **The system prompt and tool descriptions are versioned files**, not strings
  in code. A run saves which version it used.
- **Every grader is a pure function** from a trajectory (and the task) to a
  verdict with a reason. Nothing to mock in order to test one.
- **Statistics are pure functions with tests**: pass^k, pass@k, bootstrap,
  McNemar, Cohen's κ, flip rate. Seeded randomness, so the same input gives the
  same interval.
- **SQLite is the workshop, files are the record.** Runs, steps, grades and the
  cache live in SQLite. Every finished run is written to `results/<run>/`, and
  the dashboard reads only those files. Labels and taxonomy notes are JSONL
  files under `evals/`.
- **Each try gets a fresh copy of the seeded shop.** Never a shared database.

## Conventions

Strict TypeScript, no `any`. If a type is genuinely awkward, tell me rather than
casting.

Comment the decisions, not the syntax.

Money is whole rupees in integers, shown as `Rs 1,200`. The shop's "today" is
the frozen date in its database, never the computer's clock.

Every value from a file, a model or a browser is validated with Zod. A tool
call's inputs are validated before the tool runs; a bad one becomes an error
the model can read, never a crash.

Every number shown carries how many tasks and tries it came from and its error
bar. A comparison carries the noise floor.

One obvious way to do something beats a configurable one.

The dashboard is a working tool: small type, tight rows, monospace for ids and
tool inputs. Colour means pass, fail or within-noise, or isn't there. Nothing
moves unless it was clicked.

Smooth and friendly means no dead ends. Every page has an empty state that
says what to run to fill it ("No runs yet. Run `pnpm eval`."), a loading state,
and errors in plain words with what to do next. Commands do the same in the
terminal.

**All UI work uses the frontend design skill.** Load it before building any
screen. But the paragraph above overrules it — it will reach for motion, big
hero sections and decoration, and this is a tool for reading data.

## Things not to do

Breaking one of these is worse than not finishing.

- **Never use the holdout to make a fix.** No exemplar, prompt edit, tool
  description, regression task or judge prompt may come from a holdout task or
  trajectory. Never show a holdout trajectory before its version is promoted.
- **Never change a holdout task without re-freezing it on purpose**, with a
  changelog line saying why.
- **Never weaken a grader to raise a score.** If a grader seems wrong, tell me
  and show the trajectory. A grader that can't run has to fail loudly, not pass.
- **Never edit a task after seeing results without bumping the dataset
  version.**
- **Never report a number without its error bar and sample size**, and never
  call a change an improvement if it's inside the noise floor.
- **Never give the judge a 1–10 scale.** Pass or fail, a written rubric, a
  one-line reason.
- **Never put an API key in a log, trace, results file or commit.**
- **Never hardcode a model name or provider.** Both go in the config.
- **Never spend a big batch of model calls without saying so first.** A full run
  is mine to start; tell me the command and the estimate.
- **Don't install a package without asking.** Name it, say what for, wait.
- **Don't build ahead of the current phase.** No scaffolding for what's coming.
- **Don't leave the build broken.** Tell me about a failure instead of working
  around it.
- **Don't make the agent clever.** No planners, memory systems or frameworks
  beyond what a phase asks. It exists to be graded.
