# Smoke run 20261015-194943-2338

- Split: dev (smoke) · dataset v1 · 5 tasks × 4 tries = 20 tries
- Agent: openai/gpt-oss-120b from groq, then cloudflare · temperature 0 · reasoning low · prompt v1 · tools v1 · max 12 steps
- Configuration key: fda7792023dfde79
- Response cache: on
- Started 2026-10-15T19:49:43.930Z · finished 2026-10-15T19:49:44.691Z

**Smoke run: 15 of 20 tries passed, 5 failed, 0 errored.** It checks that the machinery works; it's never a score, a comparison or a gate.

Model calls: 78 (78 replayed from the cache; 70 from cloudflare, 8 from groq) · tokens in 80617 (0 cached) · out 3549 · cost $0.0287 at list price

## By task

| Task | Category | Difficulty | Passed | Errored |
| --- | --- | --- | --- | --- |
| address-02 | address | easy | 4/4 (100.0%) | 0 |
| cancel-01 | cancel | easy | 4/4 (100.0%) | 0 |
| refund-01 | refund | easy | 3/4 (75.0%) | 0 |
| status-02 | status | easy | 0/4 (0.0%) | 0 |
| transfer-01 | transfer | easy | 4/4 (100.0%) | 0 |
