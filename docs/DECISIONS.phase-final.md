# Decisions drafted on the phase-final branch

`docs/DECISIONS.md` and `docs/FLOW.md` are uncommitted in the main folder, so
this worktree doesn't have them. These entries go at the bottom of
`docs/DECISIONS.md` (renumbered after its last entry) when the branches meet,
and this file is then deleted. The FLOW.md lines to add are at the end.

---

## F-1 · 2026-10-24 · claude-opus-5-5

**Context.** `pnpm eval --replay` was asked for in Phase Final. The response
cache lives in `data/evals.db`, which is gitignored, so a fresh clone has
nothing to replay from the cache.

**Options considered.**
1. Replay a committed run: read `results/<run>/trials.jsonl`, run its tool
   calls again on a fresh shop, grade it with today's code graders, keep the
   recorded claim checks and judge verdicts, print the report. No keys, no
   calls, writes nothing.
2. A cache-only eval: `pnpm eval`, but a cache miss stops instead of calling.

**Chosen.** 1 (the user picked it). It works on a fresh clone, so a reviewer
can check a committed number without a key. A replay that grades any try
differently from the file stops with exit code 1, because then the committed
number can't be reproduced.

**Rejected.** 2: it does nothing on a fresh clone. This is lighter than the
spec's wording (the spec's replay re-runs the agent on cached model answers),
so everything that describes it says it "replays the recorded trajectories and
re-grades them with no key", never that it re-runs the agent.

**Status.** Accepted

## F-2 · 2026-10-24 · claude-opus-5-5

**Context.** The deployed pages read `results/`, `evals/`, `agent/`,
`judges/`, the config and two docs at request time. Every one of those reads is
marked `turbopackIgnore`, so Vercel's bundle for a page that renders on request
(a run, a trajectory) wouldn't contain the files.

**Options considered.**
1. `outputFileTracingIncludes` in `next.config.ts` for exactly those paths.
2. Prerender every run and trajectory page at build with `generateStaticParams`.

**Chosen.** 1. It changes no page, and it names what the deployed site may
read, which keeps `data/` (the shop and the eval store) and `.env*` out.

**Rejected.** 2: it rewrites every dynamic page and makes the build grow with
every run.

**Status.** Proposed

## F-3 · 2026-10-24 · claude-opus-5-5

**Context.** `pnpm typecheck` fails on a clean clone: `PageProps` is a type
Next generates, and `next-env.d.ts` is gitignored.

**Chosen.** `typecheck` runs `next typegen` before `tsc`. CI and a fresh clone
then check the same types as a machine that has run `pnpm dev`.

**Rejected.** Committing `next-env.d.ts`: Next rewrites it, and the generated
route types live in `.next/` anyway.

**Status.** Proposed

---

## FLOW.md additions

- `pnpm eval --replay [runId]` → `scripts/eval.ts` `main` → `src/eval/replay.ts`
  `replayRunFiles` (reads `src/results/read.ts` `readRun`/`listRuns`, checks with
  `loadTasks`, replays each try with `replayTrial`, grades with `gradeTry`,
  rebuilds sections with `src/results/write.ts` `gradedSections`) →
  `printReport`. No store, no keys, no files written.
- `pnpm regrade` now takes its tool-call replay from `src/eval/replay.ts`
  `replayTrial` (moved, unchanged).
- `buildReport` takes its stats, graders, hallucination and judge sections from
  `gradedSections` (moved, unchanged).
