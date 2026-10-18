# Tasks changelog

Every change to the holdout, and why.

- 2026-10-14 · v1 · holdout frozen (15 of 50 tasks, fingerprint 326fb1c38ac8). First freeze of v1. Holdout is 3 of 10 tasks per category, picked by a seeded shuffle (Python random.Random(20260315).sample).
- 2026-10-18 · v2 · holdout frozen (15 of 50 tasks, fingerprint 326fb1c38ac8). Test fixes, no task edited: the test customer now answers every agent turn instead of only replies containing "?", and the reply grader reads U+2010/U+2011 hyphens as "-". Both made v1 fail correct or polite agents (Phase 10 review: 79 and 16 of 145 failures). Scores from v1 and v2 are not comparable.
