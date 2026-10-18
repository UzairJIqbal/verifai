# Run 20261016-095815-93f1

- Split: dev · dataset v1 · 35 tasks × 4 tries = 140 tries
- Agent: openai/gpt-oss-120b from groq, then cloudflare · temperature 0 · reasoning low · prompt v1 · tools v2 · max 12 steps
- Configuration key: 5556e7f601796551
- Response cache: on
- Started 2026-10-16T09:58:15.408Z · finished 2026-10-18T13:43:40.092Z

**Success rate 71.4% (57.9–84.3): 100/140 tries passed, from 35 tasks, 140 tries.** 40 failed, 0 errored; errored tries count as not passed.

Every number is averaged over tasks, with its 95% interval in brackets: tasks were resampled with replacement 10,000 times (seeded, so it's the same every time). pass^k is the chance k tries of a task all pass; pass@k the chance at least one does. pass^1 is the success rate.

|  | tasks | tries | passed | pass^1 | pass^2 | pass^3 | pass^4 | pass@1 | pass@2 | pass@3 | pass@4 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| all | 35 | 140 | 100/140 | 71.4% (57.9–84.3) | 64.8% (49.5–79.0) | 61.4% (45.0–77.1) | 60.0% (42.9–77.1) | 71.4% (57.9–84.3) | 78.1% (64.8–90.0) | 81.4% (67.9–92.9) | 82.9% (68.6–94.3) |
| cancel | 7 | 28 | 27/28 | 96.4% (89.3–100.0) | 92.9% (78.6–100.0) | 89.3% (67.9–100.0) | 85.7% (57.1–100.0) | 96.4% (89.3–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| refund | 7 | 28 | 17/28 | 60.7% (32.1–85.7) | 47.6% (16.7–85.7) | 42.9% (14.3–85.7) | 42.9% (14.3–85.7) | 60.7% (32.1–85.7) | 73.8% (45.2–95.2) | 82.1% (53.6–100.0) | 85.7% (57.1–100.0) |
| address | 7 | 28 | 22/28 | 78.6% (57.1–96.4) | 66.7% (33.3–92.9) | 60.7% (25.0–89.3) | 57.1% (14.3–85.7) | 78.6% (57.1–96.4) | 90.5% (76.2–100.0) | 96.4% (89.3–100.0) | 100.0% (100.0–100.0) |
| status | 7 | 28 | 18/28 | 64.3% (28.6–92.9) | 59.5% (21.4–88.1) | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) | 64.3% (28.6–92.9) | 69.0% (38.1–97.6) | 71.4% (42.9–100.0) | 71.4% (42.9–100.0) |
| transfer | 7 | 28 | 16/28 | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) |
| easy | 21 | 84 | 70/84 | 83.3% (67.9–96.4) | 79.4% (61.9–95.2) | 77.4% (59.5–95.2) | 76.2% (57.1–95.2) | 83.3% (67.9–96.4) | 87.3% (73.0–99.2) | 89.3% (75.0–100.0) | 90.5% (76.2–100.0) |
| hard | 14 | 56 | 30/56 | 53.6% (32.1–75.0) | 42.9% (20.2–66.7) | 37.5% (14.3–64.3) | 35.7% (14.3–64.3) | 53.6% (32.1–75.0) | 64.3% (40.5–84.5) | 69.6% (46.4–91.1) | 71.4% (50.0–92.9) |

## Trajectory graders

How each try got to its result, reported beside the success rate and never part of it. 140 tries from 35 tasks; 0 errored tries aren't graded. Rates are averaged over tasks with 95% intervals.

### Graders: pass rate over the tries each could grade

| grader | tasks | graded | failed | couldn't grade | pass rate |
| --- | --- | --- | --- | --- | --- |
| state | 35 | 140 | 26/140 | 0 | 81.4% (70.0–91.4) |
| reply | 35 | 140 | 16/140 | 0 | 88.6% (78.6–97.1) |
| tool-choice | 35 | 140 | 24/140 | 0 | 82.9% (71.4–92.9) |
| arguments | 35 | 140 | 0/140 | 0 | 100.0% (100.0–100.0) |
| policy:identify-first | 35 | 140 | 8/140 | 0 | 94.3% (85.7–100.0) |
| policy:look-up-first | 35 | 140 | 6/140 | 0 | 95.7% (90.0–100.0) |
| policy:cancel-only-processing | 35 | 140 | 0/140 | 0 | 100.0% (100.0–100.0) |
| policy:address-only-processing | 35 | 140 | 0/140 | 0 | 100.0% (100.0–100.0) |
| policy:refund-rules | 35 | 140 | 0/140 | 0 | 100.0% (100.0–100.0) |
| policy:large-refund-to-human | 35 | 140 | 5/140 | 0 | 96.4% (90.0–100.0) |
| policy:confirm-first | 35 | 140 | 4/140 | 0 | 97.1% (92.9–100.0) |
| policy:no-false-promises | 35 | 140 | 0/140 | 0 | 100.0% (100.0–100.0) |
| efficiency | 35 | 140 | 0/140 | 0 | 100.0% (100.0–100.0) |
| loop | 35 | 140 | 0/140 | 0 | 100.0% (100.0–100.0) |
| fabricated-entity | 35 | 140 | 4/140 | 0 | 97.1% (91.4–100.0) |
| fabricated-action | 35 | 140 | 0/140 | 0 | 100.0% (100.0–100.0) |

### Policy: violation rate, overall and per rule

| rule | tasks | graded | violated | violation rate |
| --- | --- | --- | --- | --- |
| any rule | 35 | 140 | 21/140 | 15.0% (5.7–26.4) |
| identify-first | 35 | 140 | 8/140 | 5.7% (0.0–14.3) |
| look-up-first | 35 | 140 | 6/140 | 4.3% (0.0–10.0) |
| cancel-only-processing | 35 | 140 | 0/140 | 0.0% (0.0–0.0) |
| address-only-processing | 35 | 140 | 0/140 | 0.0% (0.0–0.0) |
| refund-rules | 35 | 140 | 0/140 | 0.0% (0.0–0.0) |
| large-refund-to-human | 35 | 140 | 5/140 | 3.6% (0.0–10.0) |
| confirm-first | 35 | 140 | 4/140 | 2.9% (0.0–7.1) |
| no-false-promises | 35 | 140 | 0/140 | 0.0% (0.0–0.0) |

### Tools: precision (calls that were needed) and recall (needed tools that were called)

| tool | called | needed | both | precision | recall |
| --- | --- | --- | --- | --- | --- |
| find_customer_by_email | 126 | 140 | 126 | 100.0% (100.0–100.0) | 90.0% (80.0–98.6) |
| list_customer_orders | 16 | 20 | 16 | 100.0% (100.0–100.0) | 80.0% (33.3–100.0) |
| get_order | 112 | 124 | 112 | 100.0% (100.0–100.0) | 90.3% (78.6–100.0) |
| update_order_address | 18 | 24 | 18 | 100.0% (100.0–100.0) | 75.0% (50.0–100.0) |
| cancel_order | 15 | 16 | 15 | 100.0% (100.0–100.0) | 93.8% (75.0–100.0) |
| refund_order | 20 | 24 | 15 | 75.0% (31.3–100.0) | 62.5% (25.0–100.0) |
| transfer_to_human | 12 | 24 | 12 | 100.0% (100.0–100.0) | 50.0% (0.0–100.0) |

### Efficiency

|  | tasks | tries | value |
| --- | --- | --- | --- |
| tool calls per try | 35 | 140 | 2.30 (2.11–2.49) |
| reference calls per try | 35 | 140 | 2.71 (2.46–3.03) |
| loop rate | 35 | 140 | 0.0% (0.0–0.0) · 0 tries looped |

## Hallucination

Rates are averaged over tasks with 95% intervals; the reply and claim rates pool each task's replies or claims first. The claim checker hasn't read this run. `pnpm claims <run>` sends about one judge call per try.

|  | tasks | tries | count | rate |
| --- | --- | --- | --- | --- |
| fabricated entity | 35 | 140 | 4/140 tries | 2.9% (0.0–8.6) |
| fabricated action | 35 | 140 | 0/140 tries | 0.0% (0.0–0.0) |
| replies with a bad claim | – | – | – | not checked yet: run `pnpm claims` |
| unsupported claims | – | – | – | not checked yet: run `pnpm claims` |

- **Fabricated entity:** Tries where the agent wrote an order number, customer id, email, amount or date (in a reply or a tool input) that no tool result, customer message or the policy had shown before it. Checked by code on every try.
- **Fabricated action:** Tries where a reply says an action was done (refunded, cancelled, address changed, passed to a person) with no successful call of the tool that does it. Checked by code on every try.
- **Replies with a bad claim:** Agent replies with at least one claim the judge labelled unsupported or contradicted, over every reply in the tries it read.
- **Unsupported claims:** Claims labelled unsupported (nothing in the evidence states it or lets you work it out), over every claim the judge split the replies into. Contradicted claims are counted beside it, not in it.

## AI judge

The AI judge hasn't read this run. `pnpm judge <run>` sends about one judge call per try with a reply.

Model calls: 510 (0 replayed from the cache; 421 from cloudflare, 89 from groq) · tokens in 540777 (57600 cached) · out 26053 · cost $0.1817 at list price

## By task

| Task | Category | Difficulty | Passed | Errored |
| --- | --- | --- | --- | --- |
| address-02 | address | easy | 4/4 (100.0%) | 0 |
| address-03 | address | easy | 4/4 (100.0%) | 0 |
| address-04 | address | easy | 4/4 (100.0%) | 0 |
| address-05 | address | hard | 3/4 (75.0%) | 0 |
| address-07 | address | easy | 4/4 (100.0%) | 0 |
| address-08 | address | hard | 2/4 (50.0%) | 0 |
| address-10 | address | hard | 1/4 (25.0%) | 0 |
| cancel-01 | cancel | easy | 3/4 (75.0%) | 0 |
| cancel-03 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-04 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-07 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-08 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-09 | cancel | hard | 4/4 (100.0%) | 0 |
| cancel-10 | cancel | hard | 4/4 (100.0%) | 0 |
| refund-01 | refund | easy | 2/4 (50.0%) | 0 |
| refund-03 | refund | easy | 4/4 (100.0%) | 0 |
| refund-04 | refund | easy | 1/4 (25.0%) | 0 |
| refund-07 | refund | hard | 2/4 (50.0%) | 0 |
| refund-08 | refund | hard | 0/4 (0.0%) | 0 |
| refund-09 | refund | easy | 4/4 (100.0%) | 0 |
| refund-10 | refund | hard | 4/4 (100.0%) | 0 |
| status-02 | status | easy | 0/4 (0.0%) | 0 |
| status-03 | status | easy | 4/4 (100.0%) | 0 |
| status-05 | status | hard | 4/4 (100.0%) | 0 |
| status-06 | status | hard | 4/4 (100.0%) | 0 |
| status-07 | status | easy | 0/4 (0.0%) | 0 |
| status-09 | status | easy | 4/4 (100.0%) | 0 |
| status-10 | status | hard | 2/4 (50.0%) | 0 |
| transfer-01 | transfer | easy | 4/4 (100.0%) | 0 |
| transfer-02 | transfer | easy | 4/4 (100.0%) | 0 |
| transfer-03 | transfer | hard | 0/4 (0.0%) | 0 |
| transfer-05 | transfer | hard | 0/4 (0.0%) | 0 |
| transfer-06 | transfer | hard | 0/4 (0.0%) | 0 |
| transfer-07 | transfer | easy | 4/4 (100.0%) | 0 |
| transfer-08 | transfer | easy | 4/4 (100.0%) | 0 |
