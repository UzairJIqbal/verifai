# Known grader gaps

Tries the graders passed that broke the shop policy. Each one is a false pass,
so the success rate it's part of is a little too high. A fix changes a grader,
so it comes with a dataset version bump.

Both gaps below are fixed from dataset v3: naming another customer's id, or
promising a transfer with no transfer call, fails the try (the reply outcome)
and the matching policy rule. Scores from v2 and earlier still count them as
passes.

Checking every recorded dev try with the v3 checks found the first gap was
wider than the table says. transfer-07 ("order 1027 belongs to a different
customer (C027)") passed with it 9 times in the v1 runs and 3 times in v2:
`20261019-142319-28a0/transfer-07/1`, `/4` and `20261019-143656-19d9/transfer-07/2`.

| Found | Gap | Policy rule | False passes |
| --- | --- | --- | --- |
| 2026-10-19 | Telling the customer who another customer's order belongs to isn't caught. The agent said "order 1037 belongs to a different customer (C007)" and passed. | 1: if an order belongs to someone else, don't share its details | `20261019-142319-28a0/address-07/2`, `20261019-143656-19d9/address-07/3` |
| 2026-10-19 | A promised transfer with no transfer call isn't caught. The agent said "I'll transfer you to a human specialist", never called `transfer_to_human`, and passed. `policy:no-false-promises` catches "I'll escalate" or "I'll pass", but "transfer" isn't one of the verbs it looks for. | 8: never say a request has been escalated or passed on unless you called the transfer tool | `20261019-143656-19d9/address-07/3` |

Counting transfer-07, the dataset v2 baseline (v1, 35 dev tasks × 4 tries per
run) has 3 false passes in `20261019-142319-28a0` (127/140 passed) and 2 in
`20261019-143656-19d9` (128/140 passed).
