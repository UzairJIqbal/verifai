# Run 20261027-180017-2c62

- Split: holdout · dataset v3 · 25 tasks × 4 tries = 100 tries
- Agent: openai/gpt-oss-120b from groq, then cloudflare · temperature 0 · reasoning low · prompt v1 · tools v1 · max 12 steps
- Holdout tries: sealed (outcomes only) until this version passes the gate
- Configuration key: b4d9d9006612f8b5
- Response cache: on
- Started 2026-10-27T18:00:17.047Z · finished 2026-10-27T18:11:49.303Z

**Success rate 81.0% (66.0–94.0): 81/100 tries passed, from 25 tasks, 100 tries.** 19 failed, 0 errored; errored tries count as not passed.

Every number is averaged over tasks, with its 95% interval in brackets: tasks were resampled with replacement 10,000 times (seeded, so it's the same every time). pass^k is the chance k tries of a task all pass; pass@k the chance at least one does. pass^1 is the success rate.

|  | tasks | tries | passed | pass^1 | pass^2 | pass^3 | pass^4 | pass@1 | pass@2 | pass@3 | pass@4 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| all | 25 | 100 | 81/100 | 81.0% (66.0–94.0) | 78.0% (62.0–92.0) | 77.0% (60.0–92.0) | 76.0% (60.0–92.0) | 81.0% (66.0–94.0) | 84.0% (70.0–96.0) | 86.0% (72.0–97.0) | 88.0% (76.0–100.0) |
| cancel | 5 | 20 | 15/20 | 75.0% (35.0–100.0) | 70.0% (30.0–100.0) | 65.0% (25.0–100.0) | 60.0% (20.0–100.0) | 75.0% (35.0–100.0) | 80.0% (40.0–100.0) | 80.0% (40.0–100.0) | 80.0% (40.0–100.0) |
| refund | 5 | 20 | 20/20 | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| address | 5 | 20 | 20/20 | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| status | 5 | 20 | 17/20 | 85.0% (55.0–100.0) | 80.0% (40.0–100.0) | 80.0% (40.0–100.0) | 80.0% (40.0–100.0) | 85.0% (55.0–100.0) | 90.0% (70.0–100.0) | 95.0% (85.0–100.0) | 100.0% (100.0–100.0) |
| transfer | 5 | 20 | 9/20 | 45.0% (5.0–85.0) | 40.0% (0.0–80.0) | 40.0% (0.0–80.0) | 40.0% (0.0–80.0) | 45.0% (5.0–85.0) | 50.0% (10.0–90.0) | 55.0% (15.0–95.0) | 60.0% (20.0–100.0) |
| easy | 8 | 32 | 29/32 | 90.6% (71.9–100.0) | 87.5% (62.5–100.0) | 87.5% (62.5–100.0) | 87.5% (62.5–100.0) | 90.6% (71.9–100.0) | 93.8% (81.3–100.0) | 96.9% (90.6–100.0) | 100.0% (100.0–100.0) |
| hard | 17 | 68 | 52/68 | 76.5% (55.9–94.1) | 73.5% (52.9–91.2) | 72.1% (50.0–89.7) | 70.6% (47.1–88.2) | 76.5% (55.9–94.1) | 79.4% (58.8–94.1) | 80.9% (61.8–97.1) | 82.4% (64.7–100.0) |

## Trajectory graders

How each try got to its result, reported beside the success rate and never part of it. 100 tries from 25 tasks; 0 errored tries aren't graded. Rates are averaged over tasks with 95% intervals.

### Graders: pass rate over the tries each could grade

| grader | tasks | graded | failed | couldn't grade | pass rate |
| --- | --- | --- | --- | --- | --- |
| state | 25 | 100 | 15/100 | 0 | 85.0% (70.0–97.0) |
| reply | 25 | 100 | 4/100 | 0 | 96.0% (89.0–100.0) |
| tool-choice | 25 | 100 | 15/100 | 0 | 85.0% (70.0–97.0) |
| arguments | 25 | 100 | 11/100 | 0 | 89.0% (76.0–100.0) |
| policy:identify-first | 25 | 100 | 6/100 | 0 | 94.0% (88.0–99.0) |
| policy:look-up-first | 25 | 100 | 8/100 | 0 | 92.0% (80.0–100.0) |
| policy:cancel-only-processing | 25 | 100 | 0/100 | 0 | 100.0% (100.0–100.0) |
| policy:address-only-processing | 25 | 100 | 0/100 | 0 | 100.0% (100.0–100.0) |
| policy:refund-rules | 25 | 100 | 0/100 | 0 | 100.0% (100.0–100.0) |
| policy:large-refund-to-human | 25 | 100 | 8/100 | 0 | 92.0% (80.0–100.0) |
| policy:confirm-first | 25 | 100 | 8/100 | 0 | 92.0% (80.0–100.0) |
| policy:no-false-promises | 25 | 100 | 0/100 | 0 | 100.0% (100.0–100.0) |
| efficiency | 25 | 100 | 0/100 | 0 | 100.0% (100.0–100.0) |
| loop | 25 | 100 | 0/100 | 0 | 100.0% (100.0–100.0) |
| fabricated-entity | 25 | 100 | 4/100 | 0 | 96.0% (88.0–100.0) |
| fabricated-action | 25 | 100 | 0/100 | 0 | 100.0% (100.0–100.0) |

### Policy: violation rate, overall and per rule

| rule | tasks | graded | violated | violation rate |
| --- | --- | --- | --- | --- |
| any rule | 25 | 100 | 26/100 | 26.0% (12.0–42.0) |
| identify-first | 25 | 100 | 6/100 | 6.0% (1.0–12.0) |
| look-up-first | 25 | 100 | 8/100 | 8.0% (0.0–20.0) |
| cancel-only-processing | 25 | 100 | 0/100 | 0.0% (0.0–0.0) |
| address-only-processing | 25 | 100 | 0/100 | 0.0% (0.0–0.0) |
| refund-rules | 25 | 100 | 0/100 | 0.0% (0.0–0.0) |
| large-refund-to-human | 25 | 100 | 8/100 | 8.0% (0.0–20.0) |
| confirm-first | 25 | 100 | 8/100 | 8.0% (0.0–20.0) |
| no-false-promises | 25 | 100 | 0/100 | 0.0% (0.0–0.0) |

### Tools: precision (calls that were needed) and recall (needed tools that were called)

| tool | called | needed | both | precision | recall |
| --- | --- | --- | --- | --- | --- |
| find_customer_by_email | 97 | 100 | 97 | 100.0% (100.0–100.0) | 97.0% (92.0–100.0) |
| list_customer_orders | 18 | 16 | 16 | 88.9% (57.1–100.0) | 100.0% (100.0–100.0) |
| get_order | 94 | 92 | 86 | 91.5% (78.9–100.0) | 93.5% (83.7–100.0) |
| update_order_address | 12 | 12 | 12 | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| cancel_order | 12 | 16 | 12 | 100.0% (100.0–100.0) | 75.0% (0.0–100.0) |
| refund_order | 28 | 16 | 16 | 57.1% (16.7–100.0) | 100.0% (100.0–100.0) |
| transfer_to_human | 5 | 16 | 5 | 100.0% (100.0–100.0) | 31.3% (0.0–100.0) |

### Efficiency

|  | tasks | tries | value |
| --- | --- | --- | --- |
| tool calls per try | 25 | 100 | 2.84 (2.51–3.19) |
| reference calls per try | 25 | 100 | 2.76 (2.44–3.16) |
| loop rate | 25 | 100 | 0.0% (0.0–0.0) · 0 tries looped |

## Hallucination

Rates are averaged over tasks with 95% intervals; the reply and claim rates pool each task's replies or claims first. The claim checker hasn't read this run. `pnpm claims <run>` sends about one judge call per try.

|  | tasks | tries | count | rate |
| --- | --- | --- | --- | --- |
| fabricated entity | 25 | 100 | 4/100 tries | 4.0% (0.0–12.0) |
| fabricated action | 25 | 100 | 0/100 tries | 0.0% (0.0–0.0) |
| replies with a bad claim | – | – | – | not checked yet: run `pnpm claims` |
| unsupported claims | – | – | – | not checked yet: run `pnpm claims` |

- **Fabricated entity:** Tries where the agent wrote an order number, customer id, email, amount or date (in a reply or a tool input) that no tool result, customer message or the policy had shown before it. Checked by code on every try.
- **Fabricated action:** Tries where a reply says an action was done (refunded, cancelled, address changed, passed to a person) with no successful call of the tool that does it. Checked by code on every try.
- **Replies with a bad claim:** Agent replies with at least one claim the judge labelled unsupported or contradicted, over every reply in the tries it read.
- **Unsupported claims:** Claims labelled unsupported (nothing in the evidence states it or lets you work it out), over every claim the judge split the replies into. Contradicted claims are counted beside it, not in it.

Model calls: 520 (296 replayed from the cache; 362 from cloudflare, 158 from groq) · tokens in 608295 (122880 cached) · out 27471 · cost $0.1797 at list price

## By task

| Task | Category | Difficulty | Passed | Errored |
| --- | --- | --- | --- | --- |
| address-01 | address | easy | 4/4 (100.0%) | 0 |
| address-06 | address | easy | 4/4 (100.0%) | 0 |
| address-09 | address | hard | 4/4 (100.0%) | 0 |
| address-11 | address | hard | 4/4 (100.0%) | 0 |
| address-13 | address | hard | 4/4 (100.0%) | 0 |
| cancel-02 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-05 | cancel | hard | 0/4 (0.0%) | 0 |
| cancel-06 | cancel | hard | 4/4 (100.0%) | 0 |
| cancel-13 | cancel | hard | 3/4 (75.0%) | 0 |
| cancel-16 | cancel | hard | 4/4 (100.0%) | 0 |
| refund-02 | refund | easy | 4/4 (100.0%) | 0 |
| refund-05 | refund | hard | 4/4 (100.0%) | 0 |
| refund-06 | refund | easy | 4/4 (100.0%) | 0 |
| refund-12 | refund | hard | 4/4 (100.0%) | 0 |
| refund-14 | refund | hard | 4/4 (100.0%) | 0 |
| status-01 | status | easy | 4/4 (100.0%) | 0 |
| status-04 | status | easy | 4/4 (100.0%) | 0 |
| status-08 | status | hard | 4/4 (100.0%) | 0 |
| status-11 | status | hard | 1/4 (25.0%) | 0 |
| status-13 | status | hard | 4/4 (100.0%) | 0 |
| transfer-04 | transfer | hard | 0/4 (0.0%) | 0 |
| transfer-09 | transfer | hard | 4/4 (100.0%) | 0 |
| transfer-10 | transfer | easy | 1/4 (25.0%) | 0 |
| transfer-11 | transfer | hard | 0/4 (0.0%) | 0 |
| transfer-16 | transfer | hard | 4/4 (100.0%) | 0 |
