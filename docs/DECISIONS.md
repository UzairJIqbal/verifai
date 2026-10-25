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

**Status.** Proposed

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
