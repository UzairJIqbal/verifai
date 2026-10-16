# Run 20261015-195811-1a91

- Split: dev · dataset v1 · 35 tasks × 4 tries = 140 tries
- Agent: openai/gpt-oss-120b from groq, then cloudflare · temperature 0 · reasoning low · prompt v1 · tools v1 · max 12 steps
- Configuration key: de66e2439d95efaf
- Response cache: on
- Started 2026-10-15T19:58:11.254Z · finished 2026-10-15T20:06:51.978Z

**Success rate 67.1% (53.6–80.0): 94/140 tries passed, from 35 tasks, 140 tries.** 46 failed, 0 errored; errored tries count as not passed.

Every number is averaged over tasks, with its 95% interval in brackets: tasks were resampled with replacement 10,000 times (seeded, so it's the same every time). pass^k is the chance k tries of a task all pass; pass@k the chance at least one does. pass^1 is the success rate.

|  | tasks | tries | passed | pass^1 | pass^2 | pass^3 | pass^4 | pass@1 | pass@2 | pass@3 | pass@4 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| all | 35 | 140 | 94/140 | 67.1% (53.6–80.0) | 58.6% (43.3–72.9) | 54.3% (38.6–70.0) | 51.4% (34.3–68.6) | 67.1% (53.6–80.0) | 75.7% (62.4–87.6) | 80.0% (67.1–91.4) | 82.9% (68.6–94.3) |
| cancel | 7 | 28 | 23/28 | 82.1% (60.7–100.0) | 73.8% (42.9–100.0) | 71.4% (42.9–100.0) | 71.4% (42.9–100.0) | 82.1% (60.7–100.0) | 90.5% (76.2–100.0) | 96.4% (89.3–100.0) | 100.0% (100.0–100.0) |
| refund | 7 | 28 | 15/28 | 53.6% (28.6–78.6) | 35.7% (14.3–64.3) | 25.0% (7.1–53.6) | 14.3% (0.0–42.9) | 53.6% (28.6–78.6) | 71.4% (42.9–92.9) | 78.6% (50.0–96.4) | 85.7% (57.1–100.0) |
| address | 7 | 28 | 15/28 | 53.6% (21.4–85.7) | 45.2% (14.3–85.7) | 42.9% (14.3–85.7) | 42.9% (14.3–85.7) | 53.6% (21.4–85.7) | 61.9% (28.6–90.5) | 67.9% (35.7–96.4) | 71.4% (42.9–100.0) |
| status | 7 | 28 | 20/28 | 71.4% (42.9–100.0) | 71.4% (42.9–100.0) | 71.4% (42.9–100.0) | 71.4% (42.9–100.0) | 71.4% (42.9–100.0) | 71.4% (42.9–100.0) | 71.4% (42.9–100.0) | 71.4% (42.9–100.0) |
| transfer | 7 | 28 | 21/28 | 75.0% (46.4–96.4) | 66.7% (35.7–92.9) | 60.7% (28.6–89.3) | 57.1% (14.3–85.7) | 75.0% (46.4–96.4) | 83.3% (54.8–100.0) | 85.7% (57.1–100.0) | 85.7% (57.1–100.0) |
| easy | 21 | 84 | 60/84 | 71.4% (53.6–88.1) | 65.1% (46.0–83.3) | 60.7% (40.5–79.8) | 57.1% (38.1–76.2) | 71.4% (53.6–88.1) | 77.8% (59.5–93.7) | 79.8% (61.9–95.2) | 81.0% (61.9–95.2) |
| hard | 14 | 56 | 34/56 | 60.7% (39.3–80.4) | 48.8% (25.0–72.6) | 44.6% (21.4–71.4) | 42.9% (14.3–71.4) | 60.7% (39.3–80.4) | 72.6% (52.4–89.3) | 80.4% (60.7–96.4) | 85.7% (64.3–100.0) |

Model calls: 490 (78 replayed from the cache; 392 from cloudflare, 98 from groq) · tokens in 513003 (58368 cached) · out 25485 · cost $0.1695 at list price

## By task

| Task | Category | Difficulty | Passed | Errored |
| --- | --- | --- | --- | --- |
| address-02 | address | easy | 4/4 (100.0%) | 0 |
| address-03 | address | easy | 0/4 (0.0%) | 0 |
| address-04 | address | easy | 0/4 (0.0%) | 0 |
| address-05 | address | hard | 4/4 (100.0%) | 0 |
| address-07 | address | easy | 4/4 (100.0%) | 0 |
| address-08 | address | hard | 2/4 (50.0%) | 0 |
| address-10 | address | hard | 1/4 (25.0%) | 0 |
| cancel-01 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-03 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-04 | cancel | easy | 2/4 (50.0%) | 0 |
| cancel-07 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-08 | cancel | easy | 4/4 (100.0%) | 0 |
| cancel-09 | cancel | hard | 1/4 (25.0%) | 0 |
| cancel-10 | cancel | hard | 4/4 (100.0%) | 0 |
| refund-01 | refund | easy | 3/4 (75.0%) | 0 |
| refund-03 | refund | easy | 3/4 (75.0%) | 0 |
| refund-04 | refund | easy | 1/4 (25.0%) | 0 |
| refund-07 | refund | hard | 3/4 (75.0%) | 0 |
| refund-08 | refund | hard | 0/4 (0.0%) | 0 |
| refund-09 | refund | easy | 4/4 (100.0%) | 0 |
| refund-10 | refund | hard | 1/4 (25.0%) | 0 |
| status-02 | status | easy | 0/4 (0.0%) | 0 |
| status-03 | status | easy | 4/4 (100.0%) | 0 |
| status-05 | status | hard | 4/4 (100.0%) | 0 |
| status-06 | status | hard | 4/4 (100.0%) | 0 |
| status-07 | status | easy | 0/4 (0.0%) | 0 |
| status-09 | status | easy | 4/4 (100.0%) | 0 |
| status-10 | status | hard | 4/4 (100.0%) | 0 |
| transfer-01 | transfer | easy | 4/4 (100.0%) | 0 |
| transfer-02 | transfer | easy | 4/4 (100.0%) | 0 |
| transfer-03 | transfer | hard | 0/4 (0.0%) | 0 |
| transfer-05 | transfer | hard | 2/4 (50.0%) | 0 |
| transfer-06 | transfer | hard | 4/4 (100.0%) | 0 |
| transfer-07 | transfer | easy | 3/4 (75.0%) | 0 |
| transfer-08 | transfer | easy | 4/4 (100.0%) | 0 |
