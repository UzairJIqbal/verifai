# Run 20261020-195021-90d4

- Split: holdout · dataset v2 · 15 tasks × 4 tries = 60 tries
- Agent: openai/gpt-oss-120b from groq, then cloudflare · temperature 0 · reasoning low · prompt v1 · tools v3 · max 12 steps
- Holdout tries: sealed (outcomes only) until this version passes the gate
- Configuration key: 0d1d7e18b31f813b
- Response cache: on
- Started 2026-10-20T19:50:21.130Z · finished 2026-10-20T19:56:45.341Z

**Success rate 71.7% (46.7–91.7): 43/60 tries passed, from 15 tasks, 60 tries.** 17 failed, 0 errored; errored tries count as not passed.

Every number is averaged over tasks, with its 95% interval in brackets: tasks were resampled with replacement 10,000 times (seeded, so it's the same every time). pass^k is the chance k tries of a task all pass; pass@k the chance at least one does. pass^1 is the success rate.

|  | tasks | tries | passed | pass^1 | pass^2 | pass^3 | pass^4 | pass@1 | pass@2 | pass@3 | pass@4 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| all | 15 | 60 | 43/60 | 71.7% (46.7–91.7) | 70.0% (46.7–90.0) | 68.3% (43.3–88.3) | 66.7% (40.0–86.7) | 71.7% (46.7–91.7) | 73.3% (46.7–93.3) | 73.3% (46.7–93.3) | 73.3% (46.7–93.3) |
| cancel | 3 | 12 | 0/12 | 0.0% (0.0–0.0) | 0.0% (0.0–0.0) | 0.0% (0.0–0.0) | 0.0% (0.0–0.0) | 0.0% (0.0–0.0) | 0.0% (0.0–0.0) | 0.0% (0.0–0.0) | 0.0% (0.0–0.0) |
| refund | 3 | 12 | 12/12 | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| address | 3 | 12 | 12/12 | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| status | 3 | 12 | 12/12 | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| transfer | 3 | 12 | 7/12 | 58.3% (0.0–100.0) | 50.0% (0.0–100.0) | 41.7% (0.0–100.0) | 33.3% (0.0–100.0) | 58.3% (0.0–100.0) | 66.7% (0.0–100.0) | 66.7% (0.0–100.0) | 66.7% (0.0–100.0) |
| easy | 8 | 32 | 27/32 | 84.4% (56.3–100.0) | 81.3% (50.0–100.0) | 78.1% (46.9–100.0) | 75.0% (37.5–100.0) | 84.4% (56.3–100.0) | 87.5% (62.5–100.0) | 87.5% (62.5–100.0) | 87.5% (62.5–100.0) |
| hard | 7 | 28 | 16/28 | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) |

## Trajectory graders

How each try got to its result, reported beside the success rate and never part of it. 60 tries from 15 tasks; 0 errored tries aren't graded. Rates are averaged over tasks with 95% intervals.

### Graders: pass rate over the tries each could grade

| grader | tasks | graded | failed | couldn't grade | pass rate |
| --- | --- | --- | --- | --- | --- |
| state | 15 | 60 | 17/60 | 0 | 71.7% (46.7–91.7) |
| reply | 15 | 60 | 0/60 | 0 | 100.0% (100.0–100.0) |
| tool-choice | 15 | 60 | 17/60 | 0 | 71.7% (46.7–91.7) |
| arguments | 15 | 60 | 3/60 | 0 | 95.0% (85.0–100.0) |
| policy:identify-first | 15 | 60 | 0/60 | 0 | 100.0% (100.0–100.0) |
| policy:look-up-first | 15 | 60 | 0/60 | 0 | 100.0% (100.0–100.0) |
| policy:cancel-only-processing | 15 | 60 | 0/60 | 0 | 100.0% (100.0–100.0) |
| policy:address-only-processing | 15 | 60 | 0/60 | 0 | 100.0% (100.0–100.0) |
| policy:refund-rules | 15 | 60 | 0/60 | 0 | 100.0% (100.0–100.0) |
| policy:large-refund-to-human | 15 | 60 | 4/60 | 0 | 93.3% (80.0–100.0) |
| policy:confirm-first | 15 | 60 | 0/60 | 0 | 100.0% (100.0–100.0) |
| policy:no-false-promises | 15 | 60 | 1/60 | 0 | 98.3% (95.0–100.0) |
| efficiency | 15 | 60 | 1/60 | 0 | 98.3% (95.0–100.0) |
| loop | 15 | 60 | 0/60 | 0 | 100.0% (100.0–100.0) |
| fabricated-entity | 15 | 60 | 0/60 | 0 | 100.0% (100.0–100.0) |
| fabricated-action | 15 | 60 | 0/60 | 0 | 100.0% (100.0–100.0) |

### Policy: violation rate, overall and per rule

| rule | tasks | graded | violated | violation rate |
| --- | --- | --- | --- | --- |
| any rule | 15 | 60 | 5/60 | 8.3% (0.0–23.3) |
| identify-first | 15 | 60 | 0/60 | 0.0% (0.0–0.0) |
| look-up-first | 15 | 60 | 0/60 | 0.0% (0.0–0.0) |
| cancel-only-processing | 15 | 60 | 0/60 | 0.0% (0.0–0.0) |
| address-only-processing | 15 | 60 | 0/60 | 0.0% (0.0–0.0) |
| refund-rules | 15 | 60 | 0/60 | 0.0% (0.0–0.0) |
| large-refund-to-human | 15 | 60 | 4/60 | 6.7% (0.0–20.0) |
| confirm-first | 15 | 60 | 0/60 | 0.0% (0.0–0.0) |
| no-false-promises | 15 | 60 | 1/60 | 1.7% (0.0–5.0) |

### Tools: precision (calls that were needed) and recall (needed tools that were called)

| tool | called | needed | both | precision | recall |
| --- | --- | --- | --- | --- | --- |
| find_customer_by_email | 60 | 60 | 60 | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| list_customer_orders | 8 | 8 | 8 | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| get_order | 56 | 56 | 52 | 92.9% (76.9–100.0) | 92.9% (76.9–100.0) |
| update_order_address | 8 | 8 | 8 | 100.0% (100.0–100.0) | 100.0% (100.0–100.0) |
| cancel_order | 0 | 12 | 0 | – | 0.0% (0.0–0.0) |
| refund_order | 13 | 8 | 8 | 61.5% (0.0–100.0) | 100.0% (100.0–100.0) |
| transfer_to_human | 12 | 12 | 7 | 58.3% (0.0–100.0) | 58.3% (0.0–100.0) |

### Efficiency

|  | tasks | tries | value |
| --- | --- | --- | --- |
| tool calls per try | 15 | 60 | 2.75 (2.37–3.20) |
| reference calls per try | 15 | 60 | 2.87 (2.40–3.40) |
| loop rate | 15 | 60 | 0.0% (0.0–0.0) · 0 tries looped |

## Hallucination

Rates are averaged over tasks with 95% intervals; the reply and claim rates pool each task's replies or claims first. The claim checker hasn't read this run. `pnpm claims <run>` sends about one judge call per try.

|  | tasks | tries | count | rate |
| --- | --- | --- | --- | --- |
| fabricated entity | 15 | 60 | 0/60 tries | 0.0% (0.0–0.0) |
| fabricated action | 15 | 60 | 0/60 tries | 0.0% (0.0–0.0) |
| replies with a bad claim | – | – | – | not checked yet: run `pnpm claims` |
| unsupported claims | – | – | – | not checked yet: run `pnpm claims` |

- **Fabricated entity:** Tries where the agent wrote an order number, customer id, email, amount or date (in a reply or a tool input) that no tool result, customer message or the policy had shown before it. Checked by code on every try.
- **Fabricated action:** Tries where a reply says an action was done (refunded, cancelled, address changed, passed to a person) with no successful call of the tool that does it. Checked by code on every try.
- **Replies with a bad claim:** Agent replies with at least one claim the judge labelled unsupported or contradicted, over every reply in the tries it read.
- **Unsupported claims:** Claims labelled unsupported (nothing in the evidence states it or lets you work it out), over every claim the judge split the replies into. Contradicted claims are counted beside it, not in it.

Model calls: 289 (0 replayed from the cache; 289 from cloudflare) · tokens in 299124 (0 cached) · out 16135 · cost $0.1168 at list price

## By task

| Task | Category | Difficulty | Passed | Errored |
| --- | --- | --- | --- | --- |
| address-01 | address | easy | 4/4 (100.0%) | 0 |
| address-06 | address | easy | 4/4 (100.0%) | 0 |
| address-09 | address | hard | 4/4 (100.0%) | 0 |
| cancel-02 | cancel | easy | 0/4 (0.0%) | 0 |
| cancel-05 | cancel | hard | 0/4 (0.0%) | 0 |
| cancel-06 | cancel | hard | 0/4 (0.0%) | 0 |
| refund-02 | refund | easy | 4/4 (100.0%) | 0 |
| refund-05 | refund | hard | 4/4 (100.0%) | 0 |
| refund-06 | refund | easy | 4/4 (100.0%) | 0 |
| status-01 | status | easy | 4/4 (100.0%) | 0 |
| status-04 | status | easy | 4/4 (100.0%) | 0 |
| status-08 | status | hard | 4/4 (100.0%) | 0 |
| transfer-04 | transfer | hard | 0/4 (0.0%) | 0 |
| transfer-09 | transfer | hard | 4/4 (100.0%) | 0 |
| transfer-10 | transfer | easy | 3/4 (75.0%) | 0 |
