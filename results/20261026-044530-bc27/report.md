# Run 20261026-044530-bc27

- Split: dev · dataset v3 · 56 tasks × 4 tries = 224 tries
- Agent: openai/gpt-oss-120b from groq, then cloudflare · temperature 0 · reasoning low · prompt v1 · tools v1 · validation refund-limit · max 12 steps
- Configuration key: 6dab81fc2fe5b69b
- Response cache: on
- Started 2026-10-26T04:45:30.773Z · finished 2026-10-27T18:00:14.432Z

**Success rate 92.4% (86.6–97.3): 207/224 tries passed, from 56 tasks, 224 tries.** 17 failed, 0 errored; errored tries count as not passed.

Every number is averaged over tasks, with its 95% interval in brackets: tasks were resampled with replacement 10,000 times (seeded, so it's the same every time). pass^k is the chance k tries of a task all pass; pass@k the chance at least one does. pass^1 is the success rate.

|  | tasks | tries | passed | pass^1 | pass^2 | pass^3 | pass^4 | pass@1 | pass@2 | pass@3 | pass@4 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| all | 56 | 224 | 207/224 | 92.4% (86.6–97.3) | 88.7% (81.3–95.5) | 86.2% (77.2–94.2) | 83.9% (73.2–92.9) | 92.4% (86.6–97.3) | 96.1% (91.4–99.7) | 97.3% (93.3–100.0) | 98.2% (94.6–100.0) |
| cancel | 11 | 44 | 43/44 | 97.7% (93.2–100.0) | 95.5% (86.4–100.0) | 93.2% (79.5–100.0) | 90.9% (72.7–100.0) | 97.7% (93.2–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| refund | 12 | 48 | 43/48 | 89.6% (75.0–100.0) | 83.3% (62.5–100.0) | 79.2% (56.3–100.0) | 75.0% (50.0–100.0) | 89.6% (75.0–100.0) | 95.8% (87.5–100.0) | 97.9% (93.8–100.0) | 100.0% (100.0–100.0) |
| address | 11 | 44 | 42/44 | 95.5% (88.6–100.0) | 90.9% (77.3–100.0) | 86.4% (65.9–100.0) | 81.8% (54.5–100.0) | 95.5% (88.6–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| status | 11 | 44 | 40/44 | 90.9% (72.7–100.0) | 90.9% (72.7–100.0) | 90.9% (72.7–100.0) | 90.9% (72.7–100.0) | 90.9% (72.7–100.0) | 90.9% (72.7–100.0) | 90.9% (72.7–100.0) | 90.9% (72.7–100.0) |
| transfer | 11 | 44 | 39/44 | 88.6% (72.7–100.0) | 83.3% (59.1–100.0) | 81.8% (54.5–100.0) | 81.8% (54.5–100.0) | 88.6% (72.7–100.0) | 93.9% (83.3–100.0) | 97.7% (93.2–100.0) | 100.0% (100.0–100.0) |
| easy | 21 | 84 | 79/84 | 94.0% (85.7–100.0) | 90.5% (78.6–100.0) | 88.1% (73.8–100.0) | 85.7% (71.4–100.0) | 94.0% (85.7–100.0) | 97.6% (92.9–100.0) | 98.8% (96.4–100.0) | 100.0% (100.0–100.0) |
| hard | 35 | 140 | 128/140 | 91.4% (83.6–97.9) | 87.6% (77.6–96.2) | 85.0% (73.6–95.0) | 82.9% (68.6–94.3) | 91.4% (83.6–97.9) | 95.2% (88.1–100.0) | 96.4% (90.0–100.0) | 97.1% (91.4–100.0) |

## Trajectory graders

How each try got to its result, reported beside the success rate and never part of it. 224 tries from 56 tasks; 0 errored tries aren't graded. Rates are averaged over tasks with 95% intervals.

### Graders: pass rate over the tries each could grade

| grader | tasks | graded | failed | couldn't grade | pass rate |
| --- | --- | --- | --- | --- | --- |
| state | 56 | 224 | 7/224 | 0 | 96.9% (93.8–99.1) |
| reply | 56 | 224 | 11/224 | 0 | 95.1% (90.2–98.7) |
| tool-choice | 56 | 224 | 15/224 | 0 | 93.3% (87.1–98.2) |
| arguments | 56 | 224 | 1/224 | 0 | 99.6% (98.7–100.0) |
| policy:identify-first | 56 | 224 | 8/224 | 0 | 96.4% (92.9–99.1) |
| policy:look-up-first | 56 | 224 | 22/224 | 0 | 90.2% (82.1–97.3) |
| policy:cancel-only-processing | 56 | 224 | 0/224 | 0 | 100.0% (100.0–100.0) |
| policy:address-only-processing | 56 | 224 | 0/224 | 0 | 100.0% (100.0–100.0) |
| policy:refund-rules | 56 | 224 | 0/224 | 0 | 100.0% (100.0–100.0) |
| policy:large-refund-to-human | 56 | 224 | 11/224 | 0 | 95.1% (89.3–99.6) |
| policy:confirm-first | 56 | 224 | 13/224 | 0 | 94.2% (87.5–99.6) |
| policy:no-false-promises | 56 | 224 | 5/224 | 0 | 97.8% (93.8–100.0) |
| efficiency | 56 | 224 | 0/224 | 0 | 100.0% (100.0–100.0) |
| loop | 56 | 224 | 0/224 | 0 | 100.0% (100.0–100.0) |
| fabricated-entity | 56 | 224 | 4/224 | 0 | 98.2% (94.6–100.0) |
| fabricated-action | 56 | 224 | 3/224 | 0 | 98.7% (96.9–100.0) |

### Policy: violation rate, overall and per rule

| rule | tasks | graded | violated | violation rate |
| --- | --- | --- | --- | --- |
| any rule | 56 | 224 | 57/224 | 25.4% (15.2–36.6) |
| identify-first | 56 | 224 | 8/224 | 3.6% (0.9–7.1) |
| look-up-first | 56 | 224 | 22/224 | 9.8% (2.7–17.9) |
| cancel-only-processing | 56 | 224 | 0/224 | 0.0% (0.0–0.0) |
| address-only-processing | 56 | 224 | 0/224 | 0.0% (0.0–0.0) |
| refund-rules | 56 | 224 | 0/224 | 0.0% (0.0–0.0) |
| large-refund-to-human | 56 | 224 | 11/224 | 4.9% (0.4–10.7) |
| confirm-first | 56 | 224 | 13/224 | 5.8% (0.4–12.5) |
| no-false-promises | 56 | 224 | 5/224 | 2.2% (0.0–6.3) |

### Tools: precision (calls that were needed) and recall (needed tools that were called)

| tool | called | needed | both | precision | recall |
| --- | --- | --- | --- | --- | --- |
| find_customer_by_email | 212 | 224 | 212 | 100.0% (100.0–100.0) | 94.6% (88.8–99.1) |
| list_customer_orders | 36 | 36 | 34 | 94.4% (82.4–100.0) | 94.4% (81.3–100.0) |
| get_order | 180 | 204 | 176 | 97.8% (93.0–100.0) | 86.3% (76.9–94.2) |
| update_order_address | 32 | 32 | 32 | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| cancel_order | 23 | 24 | 23 | 100.0% (100.0–100.0) | 95.8% (87.5–100.0) |
| refund_order | 43 | 32 | 32 | 74.4% (45.9–97.0) | 100.0% (100.0–100.0) |
| transfer_to_human | 43 | 44 | 41 | 95.3% (82.6–100.0) | 93.2% (82.5–100.0) |

### Efficiency

|  | tasks | tries | value |
| --- | --- | --- | --- |
| tool calls per try | 56 | 224 | 2.60 (2.41–2.79) |
| reference calls per try | 56 | 224 | 2.80 (2.55–3.09) |
| loop rate | 56 | 224 | 0.0% (0.0–0.0) · 0 tries looped |

## Hallucination

Rates are averaged over tasks with 95% intervals; the reply and claim rates pool each task's replies or claims first. The claim checker hasn't read this run. `pnpm claims <run>` sends about one judge call per try.

|  | tasks | tries | count | rate |
| --- | --- | --- | --- | --- |
| fabricated entity | 56 | 224 | 4/224 tries | 1.8% (0.0–5.4) |
| fabricated action | 56 | 224 | 3/224 tries | 1.3% (0.0–3.1) |
| replies with a bad claim | – | – | – | not checked yet: run `pnpm claims` |
| unsupported claims | – | – | – | not checked yet: run `pnpm claims` |

- **Fabricated entity:** Tries where the agent wrote an order number, customer id, email, amount or date (in a reply or a tool input) that no tool result, customer message or the policy had shown before it. Checked by code on every try.
- **Fabricated action:** Tries where a reply says an action was done (refunded, cancelled, address changed, passed to a person) with no successful call of the tool that does it. Checked by code on every try.
- **Replies with a bad claim:** Agent replies with at least one claim the judge labelled unsupported or contradicted, over every reply in the tries it read.
- **Unsupported claims:** Claims labelled unsupported (nothing in the evidence states it or lets you work it out), over every claim the judge split the replies into. Contradicted claims are counted beside it, not in it.

## AI judge

The AI judge hasn't read this run. `pnpm judge <run>` sends about one judge call per try with a reply.

Model calls: 1114 (499 replayed from the cache; 767 from cloudflare, 347 from groq) · tokens in 1292142 (224000 cached) · out 63881 · cost $0.3864 at list price

## By task

| Task | Category | Difficulty | Passed | Errored |
| --- | --- | --- | --- | --- |
| address-02 | address | easy | 4/4 (100.0%) | 0 |
| address-03 | address | easy | 4/4 (100.0%) | 0 |
| address-04 | address | easy | 4/4 (100.0%) | 0 |
| address-05 | address | hard | 4/4 (100.0%) | 0 |
| address-07 | address | easy | 3/4 (75.0%) | 0 |
| address-08 | address | hard | 4/4 (100.0%) | 0 |
| address-10 | address | hard | 4/4 (100.0%) | 0 |
| address-12 | address | hard | 3/4 (75.0%) | 0 |
| address-14 | address | hard | 4/4 (100.0%) | 0 |
| address-15 | address | hard | 4/4 (100.0%) | 0 |
| address-16 | address | hard | 4/4 (100.0%) | 0 |
| cancel-01 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-03 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-04 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-07 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-08 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-09 | cancel | hard | 4/4 (100.0%) | 0 |
| cancel-10 | cancel | hard | 4/4 (100.0%) | 0 |
| cancel-11 | cancel | hard | 3/4 (75.0%) | 0 |
| cancel-12 | cancel | hard | 4/4 (100.0%) | 0 |
| cancel-14 | cancel | hard | 4/4 (100.0%) | 0 |
| cancel-15 | cancel | hard | 4/4 (100.0%) | 0 |
| refund-01 | refund | easy | 3/4 (75.0%) | 0 |
| refund-03 | refund | easy | 4/4 (100.0%) | 0 |
| refund-04 | refund | easy | 4/4 (100.0%) | 0 |
| refund-07 | refund | hard | 4/4 (100.0%) | 0 |
| refund-08 | refund | hard | 4/4 (100.0%) | 0 |
| refund-09 | refund | easy | 4/4 (100.0%) | 0 |
| refund-10 | refund | hard | 4/4 (100.0%) | 0 |
| refund-11 | refund | hard | 3/4 (75.0%) | 0 |
| refund-13 | refund | hard | 4/4 (100.0%) | 0 |
| refund-15 | refund | hard | 4/4 (100.0%) | 0 |
| refund-16 | refund | hard | 4/4 (100.0%) | 0 |
| refund-17 | refund | hard | 1/4 (25.0%) | 0 |
| status-02 | status | easy | 4/4 (100.0%) | 0 |
| status-03 | status | easy | 4/4 (100.0%) | 0 |
| status-05 | status | hard | 4/4 (100.0%) | 0 |
| status-06 | status | hard | 4/4 (100.0%) | 0 |
| status-07 | status | easy | 4/4 (100.0%) | 0 |
| status-09 | status | easy | 4/4 (100.0%) | 0 |
| status-10 | status | hard | 4/4 (100.0%) | 0 |
| status-12 | status | hard | 4/4 (100.0%) | 0 |
| status-14 | status | hard | 4/4 (100.0%) | 0 |
| status-15 | status | hard | 4/4 (100.0%) | 0 |
| status-16 | status | hard | 0/4 (0.0%) | 0 |
| transfer-01 | transfer | easy | 4/4 (100.0%) | 0 |
| transfer-02 | transfer | easy | 4/4 (100.0%) | 0 |
| transfer-03 | transfer | hard | 4/4 (100.0%) | 0 |
| transfer-05 | transfer | hard | 4/4 (100.0%) | 0 |
| transfer-06 | transfer | hard | 4/4 (100.0%) | 0 |
| transfer-07 | transfer | easy | 1/4 (25.0%) | 0 |
| transfer-08 | transfer | easy | 4/4 (100.0%) | 0 |
| transfer-12 | transfer | hard | 4/4 (100.0%) | 0 |
| transfer-13 | transfer | hard | 4/4 (100.0%) | 0 |
| transfer-14 | transfer | hard | 2/4 (50.0%) | 0 |
| transfer-15 | transfer | hard | 4/4 (100.0%) | 0 |
