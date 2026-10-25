# Run 20261021-143510-65f7

- Split: dev · dataset v3 · 56 tasks × 4 tries = 224 tries
- Agent: openai/gpt-oss-120b from groq, then cloudflare · temperature 0 · reasoning low · prompt v1 · tools v1 · max 12 steps
- Configuration key: 3474b6a6374ea6c2
- Response cache: off
- Started 2026-10-21T14:35:10.197Z · finished 2026-10-23T12:26:11.392Z

**Success rate 89.3% (82.1–95.1): 200/224 tries passed, from 56 tasks, 224 tries.** 24 failed, 0 errored; errored tries count as not passed.

Every number is averaged over tasks, with its 95% interval in brackets: tasks were resampled with replacement 10,000 times (seeded, so it's the same every time). pass^k is the chance k tries of a task all pass; pass@k the chance at least one does. pass^1 is the success rate.

|  | tasks | tries | passed | pass^1 | pass^2 | pass^3 | pass^4 | pass@1 | pass@2 | pass@3 | pass@4 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| all | 56 | 224 | 200/224 | 89.3% (82.1–95.1) | 84.2% (75.9–92.0) | 80.4% (70.5–89.3) | 76.8% (66.1–87.5) | 89.3% (82.1–95.1) | 94.3% (88.1–99.1) | 95.5% (89.7–99.6) | 96.4% (91.1–100.0) |
| cancel | 11 | 44 | 43/44 | 97.7% (93.2–100.0) | 95.5% (86.4–100.0) | 93.2% (79.5–100.0) | 90.9% (72.7–100.0) | 97.7% (93.2–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| refund | 12 | 48 | 42/48 | 87.5% (72.9–100.0) | 80.6% (59.7–100.0) | 77.1% (52.1–100.0) | 75.0% (50.0–100.0) | 87.5% (72.9–100.0) | 94.4% (84.7–100.0) | 97.9% (93.8–100.0) | 100.0% (100.0–100.0) |
| address | 11 | 44 | 42/44 | 95.5% (88.6–100.0) | 90.9% (77.3–100.0) | 86.4% (65.9–100.0) | 81.8% (54.5–100.0) | 95.5% (88.6–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| status | 11 | 44 | 42/44 | 95.5% (88.6–100.0) | 90.9% (77.3–100.0) | 86.4% (65.9–100.0) | 81.8% (54.5–100.0) | 95.5% (88.6–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| transfer | 11 | 44 | 31/44 | 70.5% (45.5–93.2) | 63.6% (36.4–86.4) | 59.1% (31.8–84.1) | 54.5% (27.3–81.8) | 70.5% (45.5–93.2) | 77.3% (54.5–100.0) | 79.5% (54.5–100.0) | 81.8% (54.5–100.0) |
| easy | 21 | 84 | 78/84 | 92.9% (82.1–100.0) | 90.5% (78.6–100.0) | 88.1% (73.8–100.0) | 85.7% (71.4–100.0) | 92.9% (82.1–100.0) | 95.2% (85.7–100.0) | 95.2% (85.7–100.0) | 95.2% (85.7–100.0) |
| hard | 35 | 140 | 122/140 | 87.1% (77.9–95.0) | 80.5% (68.6–90.5) | 75.7% (62.1–87.9) | 71.4% (57.1–85.7) | 87.1% (77.9–95.0) | 93.8% (86.7–99.5) | 95.7% (89.3–100.0) | 97.1% (91.4–100.0) |

## Trajectory graders

How each try got to its result, reported beside the success rate and never part of it. 224 tries from 56 tasks; 0 errored tries aren't graded. Rates are averaged over tasks with 95% intervals.

### Graders: pass rate over the tries each could grade

| grader | tasks | graded | failed | couldn't grade | pass rate |
| --- | --- | --- | --- | --- | --- |
| state | 56 | 224 | 13/224 | 0 | 94.2% (88.8–98.2) |
| reply | 56 | 224 | 12/224 | 0 | 94.6% (89.7–98.7) |
| tool-choice | 56 | 224 | 12/224 | 0 | 94.6% (89.3–98.7) |
| arguments | 56 | 224 | 0/224 | 0 | 100.0% (100.0–100.0) |
| policy:identify-first | 56 | 224 | 11/224 | 0 | 95.1% (89.3–99.6) |
| policy:look-up-first | 56 | 224 | 24/224 | 0 | 89.3% (80.4–96.4) |
| policy:cancel-only-processing | 56 | 224 | 0/224 | 0 | 100.0% (100.0–100.0) |
| policy:address-only-processing | 56 | 224 | 0/224 | 0 | 100.0% (100.0–100.0) |
| policy:refund-rules | 56 | 224 | 0/224 | 0 | 100.0% (100.0–100.0) |
| policy:large-refund-to-human | 56 | 224 | 10/224 | 0 | 95.5% (90.2–99.6) |
| policy:confirm-first | 56 | 224 | 20/224 | 0 | 91.1% (83.9–96.9) |
| policy:no-false-promises | 56 | 224 | 6/224 | 0 | 97.3% (92.9–100.0) |
| efficiency | 56 | 224 | 0/224 | 0 | 100.0% (100.0–100.0) |
| loop | 56 | 224 | 0/224 | 0 | 100.0% (100.0–100.0) |
| fabricated-entity | 56 | 224 | 8/224 | 0 | 96.4% (91.5–100.0) |
| fabricated-action | 56 | 224 | 2/224 | 0 | 99.1% (97.3–100.0) |

### Policy: violation rate, overall and per rule

| rule | tasks | graded | violated | violation rate |
| --- | --- | --- | --- | --- |
| any rule | 56 | 224 | 65/224 | 29.0% (17.9–40.6) |
| identify-first | 56 | 224 | 11/224 | 4.9% (0.4–10.7) |
| look-up-first | 56 | 224 | 24/224 | 10.7% (3.6–19.6) |
| cancel-only-processing | 56 | 224 | 0/224 | 0.0% (0.0–0.0) |
| address-only-processing | 56 | 224 | 0/224 | 0.0% (0.0–0.0) |
| refund-rules | 56 | 224 | 0/224 | 0.0% (0.0–0.0) |
| large-refund-to-human | 56 | 224 | 10/224 | 4.5% (0.4–9.8) |
| confirm-first | 56 | 224 | 20/224 | 8.9% (3.1–16.1) |
| no-false-promises | 56 | 224 | 6/224 | 2.7% (0.0–7.1) |

### Tools: precision (calls that were needed) and recall (needed tools that were called)

| tool | called | needed | both | precision | recall |
| --- | --- | --- | --- | --- | --- |
| find_customer_by_email | 206 | 224 | 206 | 100.0% (100.0–100.0) | 92.0% (85.3–97.3) |
| list_customer_orders | 37 | 36 | 34 | 91.9% (75.0–100.0) | 94.4% (81.3–100.0) |
| get_order | 179 | 204 | 175 | 97.8% (93.0–100.0) | 85.8% (76.4–94.0) |
| update_order_address | 32 | 32 | 32 | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| cancel_order | 23 | 24 | 23 | 100.0% (100.0–100.0) | 95.8% (87.5–100.0) |
| refund_order | 42 | 32 | 32 | 76.2% (48.0–96.8) | 100.0% (100.0–100.0) |
| transfer_to_human | 33 | 44 | 33 | 100.0% (100.0–100.0) | 75.0% (52.1–93.8) |

### Efficiency

|  | tasks | tries | value |
| --- | --- | --- | --- |
| tool calls per try | 56 | 224 | 2.52 (2.33–2.70) |
| reference calls per try | 56 | 224 | 2.80 (2.55–3.09) |
| loop rate | 56 | 224 | 0.0% (0.0–0.0) · 0 tries looped |

## Hallucination

Rates are averaged over tasks with 95% intervals; the reply and claim rates pool each task's replies or claims first. The claim checker hasn't read this run. `pnpm claims <run>` sends about one judge call per try.

|  | tasks | tries | count | rate |
| --- | --- | --- | --- | --- |
| fabricated entity | 56 | 224 | 8/224 tries | 3.6% (0.0–8.5) |
| fabricated action | 56 | 224 | 2/224 tries | 0.9% (0.0–2.7) |
| replies with a bad claim | – | – | – | not checked yet: run `pnpm claims` |
| unsupported claims | – | – | – | not checked yet: run `pnpm claims` |

- **Fabricated entity:** Tries where the agent wrote an order number, customer id, email, amount or date (in a reply or a tool input) that no tool result, customer message or the policy had shown before it. Checked by code on every try.
- **Fabricated action:** Tries where a reply says an action was done (refunded, cancelled, address changed, passed to a person) with no successful call of the tool that does it. Checked by code on every try.
- **Replies with a bad claim:** Agent replies with at least one claim the judge labelled unsupported or contradicted, over every reply in the tries it read.
- **Unsupported claims:** Claims labelled unsupported (nothing in the evidence states it or lets you work it out), over every claim the judge split the replies into. Contradicted claims are counted beside it, not in it.

## AI judge

The AI judge hasn't read this run. `pnpm judge <run>` sends about one judge call per try with a reply.

Model calls: 1096 (0 replayed from the cache; 752 from cloudflare, 344 from groq) · tokens in 1262122 (264448 cached) · out 66008 · cost $0.3781 at list price

## By task

| Task | Category | Difficulty | Passed | Errored |
| --- | --- | --- | --- | --- |
| address-02 | address | easy | 4/4 (100.0%) | 0 |
| address-03 | address | easy | 4/4 (100.0%) | 0 |
| address-04 | address | easy | 4/4 (100.0%) | 0 |
| address-05 | address | hard | 4/4 (100.0%) | 0 |
| address-07 | address | easy | 4/4 (100.0%) | 0 |
| address-08 | address | hard | 4/4 (100.0%) | 0 |
| address-10 | address | hard | 4/4 (100.0%) | 0 |
| address-12 | address | hard | 3/4 (75.0%) | 0 |
| address-14 | address | hard | 3/4 (75.0%) | 0 |
| address-15 | address | hard | 4/4 (100.0%) | 0 |
| address-16 | address | hard | 4/4 (100.0%) | 0 |
| cancel-01 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-03 | cancel | easy | 3/4 (75.0%) | 0 |
| cancel-04 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-07 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-08 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-09 | cancel | hard | 4/4 (100.0%) | 0 |
| cancel-10 | cancel | hard | 4/4 (100.0%) | 0 |
| cancel-11 | cancel | hard | 4/4 (100.0%) | 0 |
| cancel-12 | cancel | hard | 4/4 (100.0%) | 0 |
| cancel-14 | cancel | hard | 4/4 (100.0%) | 0 |
| cancel-15 | cancel | hard | 4/4 (100.0%) | 0 |
| refund-01 | refund | easy | 4/4 (100.0%) | 0 |
| refund-03 | refund | easy | 4/4 (100.0%) | 0 |
| refund-04 | refund | easy | 4/4 (100.0%) | 0 |
| refund-07 | refund | hard | 4/4 (100.0%) | 0 |
| refund-08 | refund | hard | 1/4 (25.0%) | 0 |
| refund-09 | refund | easy | 4/4 (100.0%) | 0 |
| refund-10 | refund | hard | 4/4 (100.0%) | 0 |
| refund-11 | refund | hard | 2/4 (50.0%) | 0 |
| refund-13 | refund | hard | 4/4 (100.0%) | 0 |
| refund-15 | refund | hard | 4/4 (100.0%) | 0 |
| refund-16 | refund | hard | 3/4 (75.0%) | 0 |
| refund-17 | refund | hard | 4/4 (100.0%) | 0 |
| status-02 | status | easy | 4/4 (100.0%) | 0 |
| status-03 | status | easy | 4/4 (100.0%) | 0 |
| status-05 | status | hard | 4/4 (100.0%) | 0 |
| status-06 | status | hard | 4/4 (100.0%) | 0 |
| status-07 | status | easy | 4/4 (100.0%) | 0 |
| status-09 | status | easy | 3/4 (75.0%) | 0 |
| status-10 | status | hard | 4/4 (100.0%) | 0 |
| status-12 | status | hard | 4/4 (100.0%) | 0 |
| status-14 | status | hard | 4/4 (100.0%) | 0 |
| status-15 | status | hard | 4/4 (100.0%) | 0 |
| status-16 | status | hard | 3/4 (75.0%) | 0 |
| transfer-01 | transfer | easy | 4/4 (100.0%) | 0 |
| transfer-02 | transfer | easy | 4/4 (100.0%) | 0 |
| transfer-03 | transfer | hard | 0/4 (0.0%) | 0 |
| transfer-05 | transfer | hard | 3/4 (75.0%) | 0 |
| transfer-06 | transfer | hard | 1/4 (25.0%) | 0 |
| transfer-07 | transfer | easy | 0/4 (0.0%) | 0 |
| transfer-08 | transfer | easy | 4/4 (100.0%) | 0 |
| transfer-12 | transfer | hard | 4/4 (100.0%) | 0 |
| transfer-13 | transfer | hard | 4/4 (100.0%) | 0 |
| transfer-14 | transfer | hard | 3/4 (75.0%) | 0 |
| transfer-15 | transfer | hard | 4/4 (100.0%) | 0 |
