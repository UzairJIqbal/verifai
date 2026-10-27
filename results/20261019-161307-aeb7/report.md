# Run 20261019-161307-aeb7

- Split: dev · dataset v2 · 35 tasks × 4 tries = 140 tries
- Agent: openai/gpt-oss-120b from groq, then cloudflare · temperature 0 · reasoning low · prompt v1 · tools v3 · max 12 steps
- Configuration key: f9bcc2ca368c85e3
- Response cache: on
- Started 2026-10-19T16:13:07.874Z · finished 2026-10-20T19:42:10.709Z

**Success rate 79.3% (65.7–91.4): 111/140 tries passed, from 35 tasks, 140 tries.** 27 failed, 2 errored; errored tries count as not passed.

Every number is averaged over tasks, with its 95% interval in brackets: tasks were resampled with replacement 10,000 times (seeded, so it's the same every time). pass^k is the chance k tries of a task all pass; pass@k the chance at least one does. pass^1 is the success rate.

|  | tasks | tries | passed | pass^1 | pass^2 | pass^3 | pass^4 | pass@1 | pass@2 | pass@3 | pass@4 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| all | 35 | 140 | 111/140 | 79.3% (65.7–91.4) | 77.6% (63.3–91.4) | 77.1% (62.9–91.4) | 77.1% (62.9–91.4) | 79.3% (65.7–91.4) | 81.0% (67.6–92.4) | 82.1% (68.6–93.6) | 82.9% (68.6–94.3) |
| cancel | 7 | 28 | 12/28 | 42.9% (14.3–85.7) | 42.9% (14.3–85.7) | 42.9% (14.3–85.7) | 42.9% (14.3–85.7) | 42.9% (14.3–85.7) | 42.9% (14.3–85.7) | 42.9% (14.3–85.7) | 42.9% (14.3–85.7) |
| refund | 7 | 28 | 21/28 | 75.0% (42.9–100.0) | 71.4% (42.9–100.0) | 71.4% (42.9–100.0) | 71.4% (42.9–100.0) | 75.0% (42.9–100.0) | 78.6% (50.0–100.0) | 82.1% (53.6–100.0) | 85.7% (57.1–100.0) |
| address | 7 | 28 | 28/28 | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| status | 7 | 28 | 28/28 | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| transfer | 7 | 28 | 22/28 | 78.6% (50.0–100.0) | 73.8% (42.9–100.0) | 71.4% (42.9–100.0) | 71.4% (42.9–100.0) | 78.6% (50.0–100.0) | 83.3% (54.8–100.0) | 85.7% (57.1–100.0) | 85.7% (57.1–100.0) |
| easy | 21 | 84 | 68/84 | 81.0% (61.9–95.2) | 81.0% (61.9–95.2) | 81.0% (61.9–95.2) | 81.0% (61.9–95.2) | 81.0% (61.9–95.2) | 81.0% (61.9–95.2) | 81.0% (61.9–95.2) | 81.0% (61.9–95.2) |
| hard | 14 | 56 | 43/56 | 76.8% (55.4–94.6) | 72.6% (50.0–92.9) | 71.4% (50.0–92.9) | 71.4% (50.0–92.9) | 76.8% (55.4–94.6) | 81.0% (60.7–97.6) | 83.9% (64.3–100.0) | 85.7% (64.3–100.0) |

## Trajectory graders

How each try got to its result, reported beside the success rate and never part of it. 138 tries from 35 tasks; 2 errored tries aren't graded. Rates are averaged over tasks with 95% intervals.

### Graders: pass rate over the tries each could grade

| grader | tasks | graded | failed | couldn't grade | pass rate |
| --- | --- | --- | --- | --- | --- |
| state | 35 | 138 | 25/138 | 0 | 80.7% (67.1–92.1) |
| reply | 35 | 138 | 6/138 | 0 | 95.7% (88.6–100.0) |
| tool-choice | 35 | 138 | 21/138 | 0 | 83.6% (70.0–94.3) |
| arguments | 35 | 138 | 0/138 | 0 | 100.0% (100.0–100.0) |
| policy:identify-first | 35 | 138 | 0/138 | 0 | 100.0% (100.0–100.0) |
| policy:look-up-first | 35 | 138 | 12/138 | 0 | 91.4% (80.0–100.0) |
| policy:cancel-only-processing | 35 | 138 | 0/138 | 0 | 100.0% (100.0–100.0) |
| policy:address-only-processing | 35 | 138 | 0/138 | 0 | 100.0% (100.0–100.0) |
| policy:refund-rules | 35 | 138 | 0/138 | 0 | 100.0% (100.0–100.0) |
| policy:large-refund-to-human | 35 | 138 | 7/138 | 0 | 95.0% (87.1–100.0) |
| policy:confirm-first | 35 | 138 | 4/138 | 0 | 97.1% (91.4–100.0) |
| policy:no-false-promises | 35 | 138 | 1/138 | 0 | 99.3% (97.9–100.0) |
| efficiency | 35 | 138 | 0/138 | 0 | 100.0% (100.0–100.0) |
| loop | 35 | 138 | 0/138 | 0 | 100.0% (100.0–100.0) |
| fabricated-entity | 35 | 138 | 4/138 | 0 | 97.1% (91.4–100.0) |
| fabricated-action | 35 | 138 | 1/138 | 0 | 99.3% (97.9–100.0) |

### Policy: violation rate, overall and per rule

| rule | tasks | graded | violated | violation rate |
| --- | --- | --- | --- | --- |
| any rule | 35 | 138 | 24/138 | 17.1% (5.7–30.0) |
| identify-first | 35 | 138 | 0/138 | 0.0% (0.0–0.0) |
| look-up-first | 35 | 138 | 12/138 | 8.6% (0.0–20.0) |
| cancel-only-processing | 35 | 138 | 0/138 | 0.0% (0.0–0.0) |
| address-only-processing | 35 | 138 | 0/138 | 0.0% (0.0–0.0) |
| refund-rules | 35 | 138 | 0/138 | 0.0% (0.0–0.0) |
| large-refund-to-human | 35 | 138 | 7/138 | 5.0% (0.0–12.9) |
| confirm-first | 35 | 138 | 4/138 | 2.9% (0.0–8.6) |
| no-false-promises | 35 | 138 | 1/138 | 0.7% (0.0–2.1) |

### Tools: precision (calls that were needed) and recall (needed tools that were called)

| tool | called | needed | both | precision | recall |
| --- | --- | --- | --- | --- | --- |
| find_customer_by_email | 133 | 138 | 133 | 100.0% (100.0–100.0) | 96.4% (89.9–100.0) |
| list_customer_orders | 20 | 18 | 18 | 90.0% (66.7–100.0) | 100.0% (100.0–100.0) |
| get_order | 111 | 122 | 107 | 96.4% (88.5–100.0) | 87.7% (75.4–97.1) |
| update_order_address | 24 | 24 | 24 | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| cancel_order | 0 | 14 | 0 | – | 0.0% (0.0–0.0) |
| refund_order | 31 | 24 | 24 | 77.4% (42.1–100.0) | 100.0% (100.0–100.0) |
| transfer_to_human | 20 | 24 | 17 | 85.0% (50.0–100.0) | 70.8% (31.3–100.0) |

### Efficiency

|  | tasks | tries | value |
| --- | --- | --- | --- |
| tool calls per try | 35 | 138 | 2.49 (2.28–2.71) |
| reference calls per try | 35 | 138 | 2.71 (2.46–3.03) |
| loop rate | 35 | 138 | 0.0% (0.0–0.0) · 0 tries looped |

## Hallucination

Rates are averaged over tasks with 95% intervals; the reply and claim rates pool each task's replies or claims first. The claim checker hasn't read this run. `pnpm claims <run>` sends about one judge call per try.

|  | tasks | tries | count | rate |
| --- | --- | --- | --- | --- |
| fabricated entity | 35 | 138 | 4/138 tries | 2.9% (0.0–8.6) |
| fabricated action | 35 | 138 | 1/138 tries | 0.7% (0.0–2.1) |
| replies with a bad claim | – | – | – | not checked yet: run `pnpm claims` |
| unsupported claims | – | – | – | not checked yet: run `pnpm claims` |

- **Fabricated entity:** Tries where the agent wrote an order number, customer id, email, amount or date (in a reply or a tool input) that no tool result, customer message or the policy had shown before it. Checked by code on every try.
- **Fabricated action:** Tries where a reply says an action was done (refunded, cancelled, address changed, passed to a person) with no successful call of the tool that does it. Checked by code on every try.
- **Replies with a bad claim:** Agent replies with at least one claim the judge labelled unsupported or contradicted, over every reply in the tries it read.
- **Unsupported claims:** Claims labelled unsupported (nothing in the evidence states it or lets you work it out), over every claim the judge split the replies into. Contradicted claims are counted beside it, not in it.

## AI judge

The AI judge hasn't read this run. `pnpm judge <run>` sends about one judge call per try with a reply.

Model calls: 632 (11 replayed from the cache; 456 from groq, 176 from cloudflare) · tokens in 779718 (371200 cached) · out 34559 · cost $0.1462 at list price

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
| cancel-01 | cancel | easy | 0/4 (0.0%) | 0 |
| cancel-03 | cancel | easy | 0/4 (0.0%) | 0 |
| cancel-04 | cancel | easy | 0/4 (0.0%) | 0 |
| cancel-07 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-08 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-09 | cancel | hard | 0/4 (0.0%) | 2 |
| cancel-10 | cancel | hard | 4/4 (100.0%) | 0 |
| refund-01 | refund | easy | 0/4 (0.0%) | 0 |
| refund-03 | refund | easy | 4/4 (100.0%) | 0 |
| refund-04 | refund | easy | 4/4 (100.0%) | 0 |
| refund-07 | refund | hard | 4/4 (100.0%) | 0 |
| refund-08 | refund | hard | 1/4 (25.0%) | 0 |
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
| transfer-06 | transfer | hard | 2/4 (50.0%) | 0 |
| transfer-07 | transfer | easy | 4/4 (100.0%) | 0 |
| transfer-08 | transfer | easy | 4/4 (100.0%) | 0 |
