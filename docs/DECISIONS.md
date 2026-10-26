# Decisions

One entry per meaningful change (library, pattern, state approach, data shape,
trade-off). Drafted before the code is edited; the status changes once a
decision is made. Newest at the bottom.

Status is one of: Proposed, Accepted, Rejected, Superseded (by D-NNN).

---

## D-001 · 2026-10-22 · claude-opus-5-5

**Context.** Two working rules were added: log every meaningful change here
before editing code, and keep `docs/FLOW.md` as a current map of how the code
runs. A rule that lives only in one chat is forgotten by the next session.

**Options considered.**
1. Add both rules to `AGENTS.md`, which every session reads.
2. Keep them only in the assistant's private memory.
3. Leave them in this file's header and nowhere else.

**Chosen.** 1, adding the rules to `AGENTS.md` under "How we work". It's the one
file read on every prompt and it's checked in, so it holds whichever model or
session picks the work up next.

**Rejected.** 2: private memory isn't in the repository and another tool or
model never sees it. 3: nothing makes a session open this file before it starts
editing.

**Status.** Accepted (2026-10-26).

---

## D-002 · 2026-10-25 · claude-opus-5-5

**Context.** The gate fails a candidate if any category, on dev or holdout,
drops by more than a flat 5 points. The v3 noise runs (same agent twice, no
cache) moved categories by much more than that with nothing changed: transfer's
floor is 16.7 points on 11 dev tasks, refund's 9.1. Holdout categories are
smaller still, so their floors are wider. A flat 5 fails a good candidate on
luck alone, and a gate that fails on luck says nothing.

**Options considered.**
1. A category fails only when it drops by more than max(5 points, that
   category's noise floor rescaled to its task count on that split).
2. Keep the flat 5 points.
3. Use only the noise floor, with no minimum.

**Chosen.** 1. It uses the floor the gate already computes per category and
split (rescaled by √(measured tasks / tasks here), as for the overall floor),
so a drop counts only when it's bigger than what the same agent does to itself.
The 5-point minimum keeps a quiet category (cancel, 4.5) from being allowed
less than the old rule. A category with no measured floor falls back to 5
points, the strict side. The floor is the promoted version's only, never the
candidate's: the candidate is what's being judged, so its own luck must not
give it extra room (changed in review of PR #3; the overall holdout check still
uses the wider of the two, which is its strict side). The limit is rounded down
to 0.1 points, so rounding can only make it stricter, and the number shown is
the number applied. Each category's limit is saved in the gate record and
shown in the gates table. The config's `maxCategoryDropPoints` keeps its name
and now means the minimum.

**Rejected.** 2: on v3 it's below the floor in four of five categories, so it
flags noise as a regression. 3: a very steady category could get a limit near
zero and fail on one flipped try.

**Trade-off.** Small holdout categories get wide limits (transfer on 5 holdout
tasks would be about 25 points), so a real drop there can slip through. That's
the honest size of what those tasks can show; the fix is more tasks, not a
tighter number.

**Status.** Accepted (2026-10-25). Merged in PR #3.

---

## D-003 · 2026-10-26 · claude-opus-5-5

**Context.** Every errored try ever recorded is the network, not the agent: a
model call that got no answer at all (DNS failure on lost Wi-Fi, a connection
timeout, or Groq not answering within the step timeout). Errored tries were
saved as done and counted as not passed, so a Wi-Fi drop became a fail the
agent never made, and it was never redone. The second `pnpm gate v3` run lost 4
tries this way (status-12 ×3, address-16), and v1's noise run 7220 has one
(transfer-13, a Groq step timeout). Leaving v1's and dropping v3's would tilt
the comparison toward v3.

**Options considered.**
1. A model call that got no answer at all drops the whole try, wherever in the
   conversation it happened: nothing is saved, so the next run of the same
   command redoes it. "No answer" means no status came back (DNS, connection
   refused or reset, connection timeout) or the step timeout fired. Any
   failure where the provider did answer (a 400, output it couldn't parse) or
   anything after it answered (a bad tool call) still counts as a fail, as
   before.
2. Drop only tries whose first call got no answer.
3. Delete the 5 known tries by hand, no rule.

**Chosen.** 1. Three no-answer tries in a row still stop the run (most likely
the connection is down), with a message saying they weren't saved and will be
redone. A run where any try was dropped doesn't finish; carrying it on redoes
those tries. It applies to every run from now on, plus two existing runs:
the unfinished gate run of v3 on dev (its 4 tries) and noise run
20261023-122611-7220 (transfer-13 try 3). `pnpm redo-no-answer <run>` drops a
run's no-answer tries from the store; for a finished noise run it also reopens
it and its measurement, so `pnpm noise` redoes the try (about 5 Groq calls)
and saves a new noise floor from the pair. The gate takes the newest floor, so
it uses the new one.

**Not changed.** Two older runs keep their errored tries as they are: noise
run 0403 (dataset v1, 4 tries) and the broken-tool control aeb7 (dataset v2, 2
tries). Neither feeds the v3 gate, and rewriting finished history that nothing
compares against would only change old numbers.

**Rejected.** 2: address-16 and transfer-13 failed mid-conversation, and the
agent had done nothing wrong in either. 3: the next Wi-Fi drop would need the
same hand fix.

**Trade-off.** A task whose call always times out would never finish; the run
stops loudly each time instead of recording a fail. That's visible, not
silent, and raising `agent.stepTimeoutSeconds` is the fix.

**Status.** Accepted (2026-10-26).

---

## D-004 · 2026-10-26 · claude-opus-5-5

**Context.** When sending traces to Langfuse failed at the end of a command
(Wi-Fi down), the error escaped `close()`, the eval store was never closed,
and the gate crashed with an unhandled rejection after its tries were saved.

**Options considered.**
1. Catch a failed trace flush in `close()`, print a warning that some traces
   didn't reach Langfuse, and always close the store.
2. Retry the flush until it works.

**Chosen.** 1. Traces are for looking at; the store and results files are the
record, and they're already saved. A test covers it.

**Rejected.** 2: with no connection it would hang the command for nothing.

**Status.** Accepted (2026-10-26).
