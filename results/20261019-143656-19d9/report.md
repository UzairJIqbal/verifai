# Run 20261019-143656-19d9

- Split: dev · dataset v2 · 35 tasks × 4 tries = 140 tries
- Agent: openai/gpt-oss-120b from groq, then cloudflare · temperature 0 · reasoning low · prompt v1 · tools v1 · max 12 steps
- Configuration key: 95e952b995fcd27c
- Response cache: off
- Started 2026-10-19T14:36:56.643Z · finished 2026-10-19T14:48:23.362Z

**Success rate 91.4% (82.1–97.9): 128/140 tries passed, from 35 tasks, 140 tries.** 12 failed, 0 errored; errored tries count as not passed.

Every number is averaged over tasks, with its 95% interval in brackets: tasks were resampled with replacement 10,000 times (seeded, so it's the same every time). pass^k is the chance k tries of a task all pass; pass@k the chance at least one does. pass^1 is the success rate.

|  | tasks | tries | passed | pass^1 | pass^2 | pass^3 | pass^4 | pass@1 | pass@2 | pass@3 | pass@4 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| all | 35 | 140 | 128/140 | 91.4% (82.1–97.9) | 88.6% (78.6–97.1) | 85.7% (74.3–95.7) | 82.9% (68.6–94.3) | 91.4% (82.1–97.9) | 94.3% (85.7–100.0) | 94.3% (85.7–100.0) | 94.3% (85.7–100.0) |
| cancel | 7 | 28 | 27/28 | 96.4% (89.3–100.0) | 92.9% (78.6–100.0) | 89.3% (67.9–100.0) | 85.7% (57.1–100.0) | 96.4% (89.3–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| refund | 7 | 28 | 22/28 | 78.6% (50.0–96.4) | 71.4% (42.9–92.9) | 64.3% (32.1–89.3) | 57.1% (14.3–85.7) | 78.6% (50.0–96.4) | 85.7% (57.1–100.0) | 85.7% (57.1–100.0) | 85.7% (57.1–100.0) |
| address | 7 | 28 | 28/28 | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| status | 7 | 28 | 28/28 | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| transfer | 7 | 28 | 23/28 | 82.1% (53.6–100.0) | 78.6% (50.0–100.0) | 75.0% (42.9–100.0) | 71.4% (42.9–100.0) | 82.1% (53.6–100.0) | 85.7% (57.1–100.0) | 85.7% (57.1–100.0) | 85.7% (57.1–100.0) |
| easy | 21 | 84 | 81/84 | 96.4% (92.9–100.0) | 92.9% (85.7–100.0) | 89.3% (78.6–100.0) | 85.7% (71.4–100.0) | 96.4% (92.9–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| hard | 14 | 56 | 47/56 | 83.9% (64.3–100.0) | 82.1% (60.7–100.0) | 80.4% (58.9–100.0) | 78.6% (57.1–100.0) | 83.9% (64.3–100.0) | 85.7% (64.3–100.0) | 85.7% (64.3–100.0) | 85.7% (64.3–100.0) |

## Trajectory graders

How each try got to its result, reported beside the success rate and never part of it. 140 tries from 35 tasks; 0 errored tries aren't graded. Rates are averaged over tasks with 95% intervals.

### Graders: pass rate over the tries each could grade

| grader | tasks | graded | failed | couldn't grade | pass rate |
| --- | --- | --- | --- | --- | --- |
| state | 35 | 140 | 11/140 | 0 | 92.1% (82.9–98.6) |
| reply | 35 | 140 | 2/140 | 0 | 98.6% (96.4–100.0) |
| tool-choice | 35 | 140 | 10/140 | 0 | 92.9% (84.3–99.3) |
| arguments | 35 | 140 | 0/140 | 0 | 100.0% (100.0–100.0) |
| policy:identify-first | 35 | 140 | 0/140 | 0 | 100.0% (100.0–100.0) |
| policy:look-up-first | 35 | 140 | 15/140 | 0 | 89.3% (77.9–97.9) |
| policy:cancel-only-processing | 35 | 140 | 0/140 | 0 | 100.0% (100.0–100.0) |
| policy:address-only-processing | 35 | 140 | 0/140 | 0 | 100.0% (100.0–100.0) |
| policy:refund-rules | 35 | 140 | 0/140 | 0 | 100.0% (100.0–100.0) |
| policy:large-refund-to-human | 35 | 140 | 8/140 | 0 | 94.3% (85.7–100.0) |
| policy:confirm-first | 35 | 140 | 7/140 | 0 | 95.0% (87.9–100.0) |
| policy:no-false-promises | 35 | 140 | 0/140 | 0 | 100.0% (100.0–100.0) |
| efficiency | 35 | 140 | 0/140 | 0 | 100.0% (100.0–100.0) |
| loop | 35 | 140 | 0/140 | 0 | 100.0% (100.0–100.0) |
| fabricated-entity | 35 | 140 | 8/140 | 0 | 94.3% (87.1–98.6) |
| fabricated-action | 35 | 140 | 1/140 | 0 | 99.3% (97.9–100.0) |

### Policy: violation rate, overall and per rule

| rule | tasks | graded | violated | violation rate |
| --- | --- | --- | --- | --- |
| any rule | 35 | 140 | 29/140 | 20.7% (8.6–34.3) |
| identify-first | 35 | 140 | 0/140 | 0.0% (0.0–0.0) |
| look-up-first | 35 | 140 | 15/140 | 10.7% (2.1–22.1) |
| cancel-only-processing | 35 | 140 | 0/140 | 0.0% (0.0–0.0) |
| address-only-processing | 35 | 140 | 0/140 | 0.0% (0.0–0.0) |
| refund-rules | 35 | 140 | 0/140 | 0.0% (0.0–0.0) |
| large-refund-to-human | 35 | 140 | 8/140 | 5.7% (0.0–14.3) |
| confirm-first | 35 | 140 | 7/140 | 5.0% (0.0–12.1) |
| no-false-promises | 35 | 140 | 0/140 | 0.0% (0.0–0.0) |

### Tools: precision (calls that were needed) and recall (needed tools that were called)

| tool | called | needed | both | precision | recall |
| --- | --- | --- | --- | --- | --- |
| find_customer_by_email | 133 | 140 | 133 | 100.0% (100.0–100.0) | 95.0% (87.1–100.0) |
| list_customer_orders | 21 | 20 | 19 | 90.5% (66.7–100.0) | 95.0% (83.3–100.0) |
| get_order | 112 | 124 | 108 | 96.4% (88.7–100.0) | 87.1% (74.3–96.8) |
| update_order_address | 24 | 24 | 24 | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| cancel_order | 15 | 16 | 15 | 100.0% (100.0–100.0) | 93.8% (75.0–100.0) |
| refund_order | 31 | 24 | 23 | 74.2% (38.5–100.0) | 95.8% (87.5–100.0) |
| transfer_to_human | 16 | 24 | 16 | 100.0% (100.0–100.0) | 66.7% (22.2–100.0) |

### Efficiency

|  | tasks | tries | value |
| --- | --- | --- | --- |
| tool calls per try | 35 | 140 | 2.54 (2.32–2.77) |
| reference calls per try | 35 | 140 | 2.71 (2.46–3.03) |
| loop rate | 35 | 140 | 0.0% (0.0–0.0) · 0 tries looped |

## Hallucination

Rates are averaged over tasks with 95% intervals; the reply and claim rates pool each task's replies or claims first. The claim checker hasn't read this run. `pnpm claims <run>` sends about one judge call per try.

|  | tasks | tries | count | rate |
| --- | --- | --- | --- | --- |
| fabricated entity | 35 | 140 | 8/140 tries | 5.7% (1.4–12.9) |
| fabricated action | 35 | 140 | 1/140 tries | 0.7% (0.0–2.1) |
| replies with a bad claim | – | – | – | not checked yet: run `pnpm claims` |
| unsupported claims | – | – | – | not checked yet: run `pnpm claims` |

- **Fabricated entity:** Tries where the agent wrote an order number, customer id, email, amount or date (in a reply or a tool input) that no tool result, customer message or the policy had shown before it. Checked by code on every try.
- **Fabricated action:** Tries where a reply says an action was done (refunded, cancelled, address changed, passed to a person) with no successful call of the tool that does it. Checked by code on every try.
- **Replies with a bad claim:** Agent replies with at least one claim the judge labelled unsupported or contradicted, over every reply in the tries it read.
- **Unsupported claims:** Claims labelled unsupported (nothing in the evidence states it or lets you work it out), over every claim the judge split the replies into. Contradicted claims are counted beside it, not in it.

## AI judge

The AI judge hasn't read this run. `pnpm judge <run>` sends about one judge call per try with a reply.

Model calls: 644 (0 replayed from the cache; 231 from groq, 413 from cloudflare) · tokens in 735193 (233216 cached) · out 35536 · cost $0.2066 at list price

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
| cancel-01 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-03 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-04 | cancel | easy | 3/4 (75.0%) | 0 |
| cancel-07 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-08 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-09 | cancel | hard | 4/4 (100.0%) | 0 |
| cancel-10 | cancel | hard | 4/4 (100.0%) | 0 |
| refund-01 | refund | easy | 3/4 (75.0%) | 0 |
| refund-03 | refund | easy | 4/4 (100.0%) | 0 |
| refund-04 | refund | easy | 3/4 (75.0%) | 0 |
| refund-07 | refund | hard | 4/4 (100.0%) | 0 |
| refund-08 | refund | hard | 0/4 (0.0%) | 0 |
| refund-09 | refund | easy | 4/4 (100.0%) | 0 |
| refund-10 | refund | hard | 4/4 (100.0%) | 0 |
| status-02 | status | easy | 4/4 (100.0%) | 0 |
| status-03 | status | easy | 4/4 (100.0%) | 0 |
| status-05 | status | hard | 4/4 (100.0%) | 0 |
| status-06 | status | hard | 4/4 (100.0%) | 0 |
| status-07 | status | easy | 4/4 (100.0%) | 0 |
| status-09 | status | easy | 4/4 (100.0%) | 0 |
| status-10 | status | hard | 4/4 (100.0%) | 0 |
| transfer-01 | transfer | easy | 4/4 (100.0%) | 0 |
| transfer-02 | transfer | easy | 4/4 (100.0%) | 0 |
| transfer-03 | transfer | hard | 0/4 (0.0%) | 0 |
| transfer-05 | transfer | hard | 4/4 (100.0%) | 0 |
| transfer-06 | transfer | hard | 3/4 (75.0%) | 0 |
| transfer-07 | transfer | easy | 4/4 (100.0%) | 0 |
| transfer-08 | transfer | easy | 4/4 (100.0%) | 0 |
