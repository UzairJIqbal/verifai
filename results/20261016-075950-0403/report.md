# Run 20261016-075950-0403

- Split: dev · dataset v1 · 35 tasks × 4 tries = 140 tries
- Agent: openai/gpt-oss-120b from groq, then cloudflare · temperature 0 · reasoning low · prompt v1 · tools v1 · max 12 steps
- Configuration key: de66e2439d95efaf
- Response cache: off
- Started 2026-10-16T07:59:50.960Z · finished 2026-10-16T09:04:27.283Z

**Success rate 60.0% (47.1–72.9): 84/140 tries passed, from 35 tasks, 140 tries.** 52 failed, 4 errored; errored tries count as not passed.

Every number is averaged over tasks, with its 95% interval in brackets: tasks were resampled with replacement 10,000 times (seeded, so it's the same every time). pass^k is the chance k tries of a task all pass; pass@k the chance at least one does. pass^1 is the success rate.

|  | tasks | tries | passed | pass^1 | pass^2 | pass^3 | pass^4 | pass@1 | pass@2 | pass@3 | pass@4 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| all | 35 | 140 | 84/140 | 60.0% (47.1–72.9) | 48.6% (34.3–62.9) | 42.1% (27.9–57.9) | 37.1% (22.9–54.3) | 60.0% (47.1–72.9) | 71.4% (58.1–83.8) | 76.4% (62.9–88.6) | 80.0% (65.7–91.4) |
| cancel | 7 | 28 | 19/28 | 67.9% (39.3–92.9) | 57.1% (28.6–85.7) | 50.0% (17.9–85.7) | 42.9% (14.3–85.7) | 67.9% (39.3–92.9) | 78.6% (50.0–100.0) | 82.1% (53.6–100.0) | 85.7% (57.1–100.0) |
| refund | 7 | 28 | 15/28 | 53.6% (25.0–82.1) | 40.5% (11.9–73.8) | 32.1% (3.6–71.4) | 28.6% (0.0–71.4) | 53.6% (25.0–82.1) | 66.7% (35.7–95.2) | 71.4% (42.9–100.0) | 71.4% (42.9–100.0) |
| address | 7 | 28 | 15/28 | 53.6% (32.1–67.9) | 28.6% (7.1–42.9) | 14.3% (3.6–21.4) | 0.0% (0.0–0.0) | 53.6% (32.1–67.9) | 78.6% (57.1–92.9) | 89.3% (78.6–96.4) | 100.0% (100.0–100.0) |
| status | 7 | 28 | 16/28 | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) |
| transfer | 7 | 28 | 19/28 | 67.9% (35.7–92.9) | 59.5% (23.8–88.1) | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) | 67.9% (35.7–92.9) | 76.2% (47.6–97.6) | 82.1% (53.6–100.0) | 85.7% (57.1–100.0) |
| easy | 21 | 84 | 51/84 | 60.7% (44.0–77.4) | 49.2% (31.0–68.3) | 42.9% (23.8–63.1) | 38.1% (19.0–61.9) | 60.7% (44.0–77.4) | 72.2% (54.8–88.1) | 77.4% (59.5–92.9) | 81.0% (61.9–95.2) |
| hard | 14 | 56 | 33/56 | 58.9% (37.5–78.6) | 47.6% (25.0–71.4) | 41.1% (17.9–66.1) | 35.7% (14.3–64.3) | 58.9% (37.5–78.6) | 70.2% (47.6–90.5) | 75.0% (53.6–94.6) | 78.6% (57.1–100.0) |

## Trajectory graders

How each try got to its result, reported beside the success rate and never part of it. 136 tries from 35 tasks; 4 errored tries aren't graded. Rates are averaged over tasks with 95% intervals.

### Graders: pass rate over the tries each could grade

| grader | tasks | graded | failed | couldn't grade | pass rate |
| --- | --- | --- | --- | --- | --- |
| state | 35 | 136 | 38/136 | 0 | 72.9% (60.0–84.3) |
| reply | 35 | 136 | 16/136 | 0 | 88.6% (77.1–97.1) |
| tool-choice | 35 | 136 | 36/136 | 0 | 74.3% (61.4–85.7) |
| arguments | 35 | 136 | 0/136 | 0 | 100.0% (100.0–100.0) |
| policy:identify-first | 35 | 136 | 2/136 | 0 | 98.6% (95.7–100.0) |
| policy:look-up-first | 35 | 136 | 9/136 | 0 | 92.9% (84.3–99.3) |
| policy:cancel-only-processing | 35 | 136 | 0/136 | 0 | 100.0% (100.0–100.0) |
| policy:address-only-processing | 35 | 136 | 0/136 | 0 | 100.0% (100.0–100.0) |
| policy:refund-rules | 35 | 136 | 0/136 | 0 | 100.0% (100.0–100.0) |
| policy:large-refund-to-human | 35 | 136 | 4/136 | 0 | 97.1% (91.4–100.0) |
| policy:confirm-first | 35 | 136 | 5/136 | 0 | 96.4% (92.1–100.0) |
| policy:no-false-promises | 35 | 136 | 0/136 | 0 | 100.0% (100.0–100.0) |
| efficiency | 35 | 136 | 0/136 | 0 | 100.0% (100.0–100.0) |
| loop | 35 | 136 | 0/136 | 0 | 100.0% (100.0–100.0) |

### Policy: violation rate, overall and per rule

| rule | tasks | graded | violated | violation rate |
| --- | --- | --- | --- | --- |
| any rule | 35 | 136 | 19/136 | 14.3% (5.7–24.3) |
| identify-first | 35 | 136 | 2/136 | 1.4% (0.0–4.3) |
| look-up-first | 35 | 136 | 9/136 | 7.1% (0.7–15.7) |
| cancel-only-processing | 35 | 136 | 0/136 | 0.0% (0.0–0.0) |
| address-only-processing | 35 | 136 | 0/136 | 0.0% (0.0–0.0) |
| refund-rules | 35 | 136 | 0/136 | 0.0% (0.0–0.0) |
| large-refund-to-human | 35 | 136 | 4/136 | 2.9% (0.0–8.6) |
| confirm-first | 35 | 136 | 5/136 | 3.6% (0.0–7.9) |
| no-false-promises | 35 | 136 | 0/136 | 0.0% (0.0–0.0) |

### Tools: precision (calls that were needed) and recall (needed tools that were called)

| tool | called | needed | both | precision | recall |
| --- | --- | --- | --- | --- | --- |
| find_customer_by_email | 120 | 136 | 120 | 100.0% (100.0–100.0) | 88.2% (77.1–97.1) |
| list_customer_orders | 19 | 19 | 17 | 89.5% (58.3–100.0) | 89.5% (66.7–100.0) |
| get_order | 101 | 120 | 101 | 100.0% (100.0–100.0) | 84.2% (71.0–95.0) |
| update_order_address | 14 | 23 | 14 | 100.0% (100.0–100.0) | 60.9% (37.5–85.7) |
| cancel_order | 7 | 16 | 7 | 100.0% (100.0–100.0) | 43.8% (0.0–75.0) |
| refund_order | 18 | 24 | 14 | 77.8% (33.3–100.0) | 58.3% (25.0–91.7) |
| transfer_to_human | 13 | 24 | 13 | 100.0% (100.0–100.0) | 54.2% (9.4–100.0) |

### Efficiency

|  | tasks | tries | value |
| --- | --- | --- | --- |
| tool calls per try | 35 | 136 | 2.18 (1.95–2.39) |
| reference calls per try | 35 | 136 | 2.71 (2.46–3.03) |
| loop rate | 35 | 136 | 0.0% (0.0–0.0) · 0 tries looped |

Model calls: 481 (0 replayed from the cache; 142 from cloudflare, 339 from groq) · tokens in 569847 (323328 cached) · out 24942 · cost $0.1062 at list price

## By task

| Task | Category | Difficulty | Passed | Errored |
| --- | --- | --- | --- | --- |
| address-02 | address | easy | 3/4 (75.0%) | 0 |
| address-03 | address | easy | 1/4 (25.0%) | 0 |
| address-04 | address | easy | 1/4 (25.0%) | 0 |
| address-05 | address | hard | 3/4 (75.0%) | 1 |
| address-07 | address | easy | 1/4 (25.0%) | 3 |
| address-08 | address | hard | 3/4 (75.0%) | 0 |
| address-10 | address | hard | 3/4 (75.0%) | 0 |
| cancel-01 | cancel | easy | 3/4 (75.0%) | 0 |
| cancel-03 | cancel | easy | 3/4 (75.0%) | 0 |
| cancel-04 | cancel | easy | 0/4 (0.0%) | 0 |
| cancel-07 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-08 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-09 | cancel | hard | 1/4 (25.0%) | 0 |
| cancel-10 | cancel | hard | 4/4 (100.0%) | 0 |
| refund-01 | refund | easy | 2/4 (50.0%) | 0 |
| refund-03 | refund | easy | 3/4 (75.0%) | 0 |
| refund-04 | refund | easy | 0/4 (0.0%) | 0 |
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
| status-10 | status | hard | 0/4 (0.0%) | 0 |
| transfer-01 | transfer | easy | 4/4 (100.0%) | 0 |
| transfer-02 | transfer | easy | 4/4 (100.0%) | 0 |
| transfer-03 | transfer | hard | 0/4 (0.0%) | 0 |
| transfer-05 | transfer | hard | 1/4 (25.0%) | 0 |
| transfer-06 | transfer | hard | 4/4 (100.0%) | 0 |
| transfer-07 | transfer | easy | 2/4 (50.0%) | 0 |
| transfer-08 | transfer | easy | 4/4 (100.0%) | 0 |
