# Run 20261023-122611-7220

- Split: dev · dataset v3 · 56 tasks × 4 tries = 224 tries
- Agent: openai/gpt-oss-120b from groq, then cloudflare · temperature 0 · reasoning low · prompt v1 · tools v1 · max 12 steps
- Configuration key: 3474b6a6374ea6c2
- Response cache: off
- Started 2026-10-23T12:26:11.693Z · finished 2026-10-25T09:21:28.533Z

**Success rate 89.3% (83.5–94.2): 200/224 tries passed, from 56 tasks, 224 tries.** 23 failed, 1 errored; errored tries count as not passed.

Every number is averaged over tasks, with its 95% interval in brackets: tasks were resampled with replacement 10,000 times (seeded, so it's the same every time). pass^k is the chance k tries of a task all pass; pass@k the chance at least one does. pass^1 is the success rate.

|  | tasks | tries | passed | pass^1 | pass^2 | pass^3 | pass^4 | pass@1 | pass@2 | pass@3 | pass@4 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| all | 56 | 224 | 200/224 | 89.3% (83.5–94.2) | 82.4% (74.1–90.2) | 77.2% (67.0–86.6) | 73.2% (60.7–83.9) | 89.3% (83.5–94.2) | 96.1% (91.7–99.4) | 97.8% (93.8–100.0) | 98.2% (94.6–100.0) |
| cancel | 11 | 44 | 44/44 | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| refund | 12 | 48 | 43/48 | 89.6% (79.2–97.9) | 80.6% (63.9–95.8) | 72.9% (50.0–93.8) | 66.7% (41.7–91.7) | 89.6% (79.2–97.9) | 98.6% (95.8–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| address | 11 | 44 | 40/44 | 90.9% (79.5–100.0) | 83.3% (65.2–100.0) | 77.3% (52.3–100.0) | 72.7% (45.5–100.0) | 90.9% (79.5–100.0) | 98.5% (95.5–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| status | 11 | 44 | 40/44 | 90.9% (77.3–100.0) | 84.8% (62.1–100.0) | 81.8% (54.5–100.0) | 81.8% (54.5–100.0) | 90.9% (77.3–100.0) | 97.0% (92.4–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| transfer | 11 | 44 | 33/44 | 75.0% (54.5–90.9) | 63.6% (40.9–86.4) | 54.5% (29.5–79.5) | 45.5% (18.2–72.7) | 75.0% (54.5–90.9) | 86.4% (68.2–100.0) | 88.6% (70.5–100.0) | 90.9% (72.7–100.0) |
| easy | 21 | 84 | 79/84 | 94.0% (88.1–98.8) | 88.9% (77.8–97.6) | 84.5% (69.0–96.4) | 81.0% (61.9–95.2) | 94.0% (88.1–98.8) | 99.2% (97.6–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| hard | 35 | 140 | 121/140 | 86.4% (77.9–93.6) | 78.6% (67.1–89.0) | 72.9% (59.3–85.7) | 68.6% (54.3–82.9) | 86.4% (77.9–93.6) | 94.3% (87.1–99.0) | 96.4% (90.0–100.0) | 97.1% (91.4–100.0) |

## Trajectory graders

How each try got to its result, reported beside the success rate and never part of it. 223 tries from 56 tasks; 1 errored tries aren't graded. Rates are averaged over tasks with 95% intervals.

### Graders: pass rate over the tries each could grade

| grader | tasks | graded | failed | couldn't grade | pass rate |
| --- | --- | --- | --- | --- | --- |
| state | 56 | 223 | 12/223 | 0 | 94.6% (90.6–98.2) |
| reply | 56 | 223 | 12/223 | 0 | 94.6% (89.7–98.2) |
| tool-choice | 56 | 223 | 15/223 | 0 | 93.3% (87.9–97.8) |
| arguments | 56 | 223 | 0/223 | 0 | 100.0% (100.0–100.0) |
| policy:identify-first | 56 | 223 | 4/223 | 0 | 98.2% (96.4–99.6) |
| policy:look-up-first | 56 | 223 | 23/223 | 0 | 89.7% (81.7–96.4) |
| policy:cancel-only-processing | 56 | 223 | 0/223 | 0 | 100.0% (100.0–100.0) |
| policy:address-only-processing | 56 | 223 | 0/223 | 0 | 100.0% (100.0–100.0) |
| policy:refund-rules | 56 | 223 | 4/223 | 0 | 98.2% (94.6–100.0) |
| policy:large-refund-to-human | 56 | 223 | 7/223 | 0 | 96.9% (92.9–99.6) |
| policy:confirm-first | 56 | 223 | 20/223 | 0 | 91.1% (83.5–97.8) |
| policy:no-false-promises | 56 | 223 | 2/223 | 0 | 99.1% (97.8–100.0) |
| efficiency | 56 | 223 | 0/223 | 0 | 100.0% (100.0–100.0) |
| loop | 56 | 223 | 1/223 | 0 | 99.6% (98.7–100.0) |
| fabricated-entity | 56 | 223 | 9/223 | 0 | 96.0% (91.5–99.1) |
| fabricated-action | 56 | 223 | 2/223 | 0 | 99.1% (97.8–100.0) |

### Policy: violation rate, overall and per rule

| rule | tasks | graded | violated | violation rate |
| --- | --- | --- | --- | --- |
| any rule | 56 | 223 | 50/223 | 22.3% (13.4–32.1) |
| identify-first | 56 | 223 | 4/223 | 1.8% (0.4–3.6) |
| look-up-first | 56 | 223 | 23/223 | 10.3% (3.6–18.3) |
| cancel-only-processing | 56 | 223 | 0/223 | 0.0% (0.0–0.0) |
| address-only-processing | 56 | 223 | 0/223 | 0.0% (0.0–0.0) |
| refund-rules | 56 | 223 | 4/223 | 1.8% (0.0–5.4) |
| large-refund-to-human | 56 | 223 | 7/223 | 3.1% (0.4–7.1) |
| confirm-first | 56 | 223 | 20/223 | 8.9% (2.2–16.5) |
| no-false-promises | 56 | 223 | 2/223 | 0.9% (0.0–2.2) |

### Tools: precision (calls that were needed) and recall (needed tools that were called)

| tool | called | needed | both | precision | recall |
| --- | --- | --- | --- | --- | --- |
| find_customer_by_email | 209 | 223 | 209 | 100.0% (100.0–100.0) | 93.7% (87.1–99.1) |
| list_customer_orders | 39 | 36 | 34 | 87.2% (62.9–100.0) | 94.4% (81.3–100.0) |
| get_order | 176 | 203 | 172 | 97.7% (92.8–100.0) | 84.7% (74.6–93.6) |
| update_order_address | 31 | 32 | 31 | 100.0% (100.0–100.0) | 96.9% (90.0–100.0) |
| cancel_order | 24 | 24 | 24 | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| refund_order | 43 | 32 | 32 | 74.4% (46.2–94.7) | 100.0% (100.0–100.0) |
| transfer_to_human | 39 | 43 | 36 | 92.3% (76.7–100.0) | 83.7% (66.7–97.4) |

### Efficiency

|  | tasks | tries | value |
| --- | --- | --- | --- |
| tool calls per try | 56 | 223 | 2.58 (2.38–2.77) |
| reference calls per try | 56 | 223 | 2.80 (2.55–3.09) |
| loop rate | 56 | 223 | 0.4% (0.0–1.3) · 1 tries looped |

## Hallucination

Rates are averaged over tasks with 95% intervals; the reply and claim rates pool each task's replies or claims first. The claim checker hasn't read this run. `pnpm claims <run>` sends about one judge call per try.

|  | tasks | tries | count | rate |
| --- | --- | --- | --- | --- |
| fabricated entity | 56 | 223 | 9/223 tries | 4.0% (0.9–8.5) |
| fabricated action | 56 | 223 | 2/223 tries | 0.9% (0.0–2.2) |
| replies with a bad claim | – | – | – | not checked yet: run `pnpm claims` |
| unsupported claims | – | – | – | not checked yet: run `pnpm claims` |

- **Fabricated entity:** Tries where the agent wrote an order number, customer id, email, amount or date (in a reply or a tool input) that no tool result, customer message or the policy had shown before it. Checked by code on every try.
- **Fabricated action:** Tries where a reply says an action was done (refunded, cancelled, address changed, passed to a person) with no successful call of the tool that does it. Checked by code on every try.
- **Replies with a bad claim:** Agent replies with at least one claim the judge labelled unsupported or contradicted, over every reply in the tries it read.
- **Unsupported claims:** Claims labelled unsupported (nothing in the evidence states it or lets you work it out), over every claim the judge split the replies into. Contradicted claims are counted beside it, not in it.

## AI judge

The AI judge hasn't read this run. `pnpm judge <run>` sends about one judge call per try with a reply.

Model calls: 1106 (0 replayed from the cache; 581 from groq, 525 from cloudflare) · tokens in 1346964 (531712 cached) · out 63345 · cost $0.3193 at list price

## By task

| Task | Category | Difficulty | Passed | Errored |
| --- | --- | --- | --- | --- |
| address-02 | address | easy | 4/4 (100.0%) | 0 |
| address-03 | address | easy | 4/4 (100.0%) | 0 |
| address-04 | address | easy | 4/4 (100.0%) | 0 |
| address-05 | address | hard | 4/4 (100.0%) | 0 |
| address-07 | address | easy | 2/4 (50.0%) | 0 |
| address-08 | address | hard | 4/4 (100.0%) | 0 |
| address-10 | address | hard | 4/4 (100.0%) | 0 |
| address-12 | address | hard | 3/4 (75.0%) | 0 |
| address-14 | address | hard | 4/4 (100.0%) | 0 |
| address-15 | address | hard | 4/4 (100.0%) | 0 |
| address-16 | address | hard | 3/4 (75.0%) | 0 |
| cancel-01 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-03 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-04 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-07 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-08 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-09 | cancel | hard | 4/4 (100.0%) | 0 |
| cancel-10 | cancel | hard | 4/4 (100.0%) | 0 |
| cancel-11 | cancel | hard | 4/4 (100.0%) | 0 |
| cancel-12 | cancel | hard | 4/4 (100.0%) | 0 |
| cancel-14 | cancel | hard | 4/4 (100.0%) | 0 |
| cancel-15 | cancel | hard | 4/4 (100.0%) | 0 |
| refund-01 | refund | easy | 3/4 (75.0%) | 0 |
| refund-03 | refund | easy | 4/4 (100.0%) | 0 |
| refund-04 | refund | easy | 4/4 (100.0%) | 0 |
| refund-07 | refund | hard | 4/4 (100.0%) | 0 |
| refund-08 | refund | hard | 3/4 (75.0%) | 0 |
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
| status-09 | status | easy | 4/4 (100.0%) | 0 |
| status-10 | status | hard | 4/4 (100.0%) | 0 |
| status-12 | status | hard | 4/4 (100.0%) | 0 |
| status-14 | status | hard | 4/4 (100.0%) | 0 |
| status-15 | status | hard | 2/4 (50.0%) | 0 |
| status-16 | status | hard | 2/4 (50.0%) | 0 |
| transfer-01 | transfer | easy | 3/4 (75.0%) | 0 |
| transfer-02 | transfer | easy | 4/4 (100.0%) | 0 |
| transfer-03 | transfer | hard | 1/4 (25.0%) | 0 |
| transfer-05 | transfer | hard | 4/4 (100.0%) | 0 |
| transfer-06 | transfer | hard | 0/4 (0.0%) | 0 |
| transfer-07 | transfer | easy | 3/4 (75.0%) | 0 |
| transfer-08 | transfer | easy | 4/4 (100.0%) | 0 |
| transfer-12 | transfer | hard | 4/4 (100.0%) | 0 |
| transfer-13 | transfer | hard | 3/4 (75.0%) | 1 |
| transfer-14 | transfer | hard | 3/4 (75.0%) | 0 |
| transfer-15 | transfer | hard | 4/4 (100.0%) | 0 |
