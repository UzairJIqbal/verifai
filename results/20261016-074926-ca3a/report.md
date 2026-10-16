# Run 20261016-074926-ca3a

- Split: dev · dataset v1 · 35 tasks × 4 tries = 140 tries
- Agent: openai/gpt-oss-120b from groq, then cloudflare · temperature 0 · reasoning low · prompt v1 · tools v1 · max 12 steps
- Configuration key: de66e2439d95efaf
- Response cache: off
- Started 2026-10-16T07:49:26.355Z · finished 2026-10-16T07:59:50.827Z

**Success rate 66.4% (52.9–80.0): 93/140 tries passed, from 35 tasks, 140 tries.** 47 failed, 0 errored; errored tries count as not passed.

Every number is averaged over tasks, with its 95% interval in brackets: tasks were resampled with replacement 10,000 times (seeded, so it's the same every time). pass^k is the chance k tries of a task all pass; pass@k the chance at least one does. pass^1 is the success rate.

|  | tasks | tries | passed | pass^1 | pass^2 | pass^3 | pass^4 | pass@1 | pass@2 | pass@3 | pass@4 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| all | 35 | 140 | 93/140 | 66.4% (52.9–80.0) | 59.0% (43.8–73.3) | 54.3% (38.6–70.0) | 51.4% (34.3–68.6) | 66.4% (52.9–80.0) | 73.8% (59.5–87.1) | 76.4% (62.1–90.0) | 77.1% (62.9–91.4) |
| cancel | 7 | 28 | 22/28 | 78.6% (50.0–100.0) | 73.8% (42.9–100.0) | 71.4% (42.9–100.0) | 71.4% (42.9–100.0) | 78.6% (50.0–100.0) | 83.3% (54.8–100.0) | 85.7% (57.1–100.0) | 85.7% (57.1–100.0) |
| refund | 7 | 28 | 17/28 | 60.7% (35.7–78.6) | 40.5% (19.0–64.3) | 25.0% (7.1–53.6) | 14.3% (0.0–42.9) | 60.7% (35.7–78.6) | 81.0% (52.4–97.6) | 85.7% (57.1–100.0) | 85.7% (57.1–100.0) |
| address | 7 | 28 | 19/28 | 67.9% (39.3–92.9) | 59.5% (23.8–88.1) | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) | 67.9% (39.3–92.9) | 76.2% (47.6–97.6) | 82.1% (53.6–100.0) | 85.7% (57.1–100.0) |
| status | 7 | 28 | 19/28 | 67.9% (35.7–96.4) | 64.3% (28.6–92.9) | 60.7% (25.0–89.3) | 57.1% (14.3–85.7) | 67.9% (35.7–96.4) | 71.4% (42.9–100.0) | 71.4% (42.9–100.0) | 71.4% (42.9–100.0) |
| transfer | 7 | 28 | 16/28 | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) | 57.1% (14.3–85.7) |
| easy | 21 | 84 | 62/84 | 73.8% (56.0–89.3) | 68.3% (49.2–86.5) | 64.3% (44.0–83.3) | 61.9% (42.9–81.0) | 73.8% (56.0–89.3) | 79.4% (61.1–94.4) | 81.0% (61.9–95.2) | 81.0% (61.9–95.2) |
| hard | 14 | 56 | 31/56 | 55.4% (33.9–76.8) | 45.2% (22.6–67.9) | 39.3% (16.1–64.3) | 35.7% (14.3–64.3) | 55.4% (33.9–76.8) | 65.5% (41.7–86.9) | 69.6% (46.4–91.1) | 71.4% (50.0–92.9) |

Model calls: 486 (0 replayed from the cache; 391 from cloudflare, 95 from groq) · tokens in 506765 (58368 cached) · out 25032 · cost $0.1674 at list price

## By task

| Task | Category | Difficulty | Passed | Errored |
| --- | --- | --- | --- | --- |
| address-02 | address | easy | 4/4 (100.0%) | 0 |
| address-03 | address | easy | 2/4 (50.0%) | 0 |
| address-04 | address | easy | 0/4 (0.0%) | 0 |
| address-05 | address | hard | 4/4 (100.0%) | 0 |
| address-07 | address | easy | 4/4 (100.0%) | 0 |
| address-08 | address | hard | 1/4 (25.0%) | 0 |
| address-10 | address | hard | 4/4 (100.0%) | 0 |
| cancel-01 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-03 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-04 | cancel | easy | 0/4 (0.0%) | 0 |
| cancel-07 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-08 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-09 | cancel | hard | 2/4 (50.0%) | 0 |
| cancel-10 | cancel | hard | 4/4 (100.0%) | 0 |
| refund-01 | refund | easy | 3/4 (75.0%) | 0 |
| refund-03 | refund | easy | 2/4 (50.0%) | 0 |
| refund-04 | refund | easy | 3/4 (75.0%) | 0 |
| refund-07 | refund | hard | 2/4 (50.0%) | 0 |
| refund-08 | refund | hard | 0/4 (0.0%) | 0 |
| refund-09 | refund | easy | 4/4 (100.0%) | 0 |
| refund-10 | refund | hard | 3/4 (75.0%) | 0 |
| status-02 | status | easy | 0/4 (0.0%) | 0 |
| status-03 | status | easy | 4/4 (100.0%) | 0 |
| status-05 | status | hard | 4/4 (100.0%) | 0 |
| status-06 | status | hard | 4/4 (100.0%) | 0 |
| status-07 | status | easy | 0/4 (0.0%) | 0 |
| status-09 | status | easy | 4/4 (100.0%) | 0 |
| status-10 | status | hard | 3/4 (75.0%) | 0 |
| transfer-01 | transfer | easy | 4/4 (100.0%) | 0 |
| transfer-02 | transfer | easy | 4/4 (100.0%) | 0 |
| transfer-03 | transfer | hard | 0/4 (0.0%) | 0 |
| transfer-05 | transfer | hard | 0/4 (0.0%) | 0 |
| transfer-06 | transfer | hard | 0/4 (0.0%) | 0 |
| transfer-07 | transfer | easy | 4/4 (100.0%) | 0 |
| transfer-08 | transfer | easy | 4/4 (100.0%) | 0 |
