# Changelog

Every promoted agent version: what changed, why, and what the gate measured.

## v1

- The starting agent: prompt v1, tool descriptions v1, no validation step, no exemplars. Promoted by default, not by a gate.
- Latest measurement, dataset v3: dev success 89.7% (95% interval 83.9 to 94.6) · 56 tasks × 4 tries (run 20261023-122611-7220); holdout success 81.0% (95% interval 66.0 to 94.0) · 25 tasks × 4 tries (run 20261027-180017-2c62). Noise floor 4.9 points, from two runs of the same configuration (`results/noise-floors.jsonl`).

## Tried, not promoted

Candidates that went through the gate and failed it. A failed gate changes nothing: v1 stays promoted, and the candidate's holdout tries stay sealed (outcomes only).

### v3 · 2026-10-27 · tried, not promoted

- What changed: validation step none → refund-limit (on top of v1: prompt v1 · tools v1).
- Why: In 20 reviewed dev failures (refund-08, transfer-03) the agent refunded over Rs 10,000 itself; refund_order now refuses any amount over the limit and tells it to transfer to a person.
- Target: large-refund-itself, the top category of the latest failure taxonomy.
- Dataset: v3.
- Holdout success: 81.0% → 83.0%, +2.0 points (95% interval +0.0 to +6.0; McNemar p 1.000; noise floor 7.3 points) · 25 tasks × 4 tries
- Dev success: 89.7% → 92.4%, +2.7 points (95% interval -3.6 to +9.4; McNemar p 0.727; noise floor 4.9 points) · 56 tasks × 4 tries
- By category, points: holdout cancel +0.0 (limit 6.6), refund +0.0 (limit 14.1), address +0.0 (limit 16.1), status +0.0 (limit 16.1), transfer +10.0 (limit 23.8); dev cancel -2.3 (limit 5.0), refund +0.0 (limit 9.1), address +4.5 (limit 10.9), status +0.0 (limit 10.9), transfer +11.4 (limit 16.0). None dropped more than its limit.
- Why it failed: the holdout gain (+2.0 points) is inside the noise floor (7.3), and McNemar finds no lean either way. The fix did what it aimed at (on dev, the refund-rules check failed 4 of 224 tries under v1 and 0 under v3), but too few tries failed that way for the overall rate to move beyond noise, and on holdout v1 never broke the rule.
- Noise floor from configuration 3474b6a6374ea6c2 (dataset v3, 56 tasks, measured 2026-10-26), rescaled to each slice's task count; the holdout floor is estimated from dev, since holdout is never run twice to measure its own.
- Runs: dev 20261023-122611-7220 → 20261026-044530-bc27; holdout 20261027-180017-2c62 → 20261027-181149-1199. Gate record: results/gates/20261027-181244-v3.json.

### v2 · 2026-10-20 · tried, not promoted (deliberate control)

- What changed: tool descriptions v1 → v3 (on top of v1: prompt v1 · tools v1).
- Why: A deliberately broken control, not a real fix: tools v3 removes cancel_order, so the gate must fail it. It did.
- Dataset: v2.
- Holdout success: 81.7% → 71.7%, -10.0 points (95% interval -30.0 to +6.7; McNemar p 1.000; noise floor 7.1 points) · 15 tasks × 4 tries
- Dev success: 91.4% → 79.3%, -12.1 points (95% interval -23.6 to -2.1; McNemar p 0.031; noise floor 4.6 points) · 35 tasks × 4 tries
- By category, points: holdout cancel -66.7, refund +0.0, address +0.0, status +0.0, transfer +16.7; dev cancel -53.6, refund -3.6, address +0.0, status +0.0, transfer -3.6. Every limit was 5.0 points (before D-002).
- Why it failed: no holdout gain beyond the noise floor, and cancel dropped far past its limit on both splits (dev -53.6 points on 7 tasks, holdout -66.7 on 3).
- Noise floor from configuration 95e952b995fcd27c (dataset v2, 35 tasks, measured 2026-10-19), rescaled to each slice's task count.
- Runs: dev 20261019-143656-19d9 → 20261019-161307-aeb7; holdout 20261020-194446-9c06 → 20261020-195021-90d4. Gate record: results/gates/20261020-195645-v2.json.
