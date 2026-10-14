# Phase 7 — Hallucination checks

## Goal

The report shows four hallucination rates, each with a written definition, an error bar, and examples you can click.

## Where this starts

Every try is graded on outcome and trajectory, and you can read any of them on the dashboard. Nothing checks whether what the agent said was true.

## Build

- **Fabricated entity check (code).** Pull every order number, customer id, email, amount and date out of the final reply and out of every tool call's inputs. Any value that never appeared in a tool result or the customer's messages is fabricated.
- **Fabricated action check (code).** A fixed list of action phrases ("I've refunded", "I've cancelled", "I've updated your address", "I've passed this to the team") mapped to the tool each needs. A phrase with no successful matching call in the trajectory is a fabricated action.
- **The claim checker (judge model).** Split the final reply into short single claims, then label each one *supported*, *contradicted* or *unsupported* against the tool results in that trajectory, with the evidence it used. One call per try where possible.
- **Four rates in the report**: responses with at least one unsupported or contradicted claim; unsupported claims out of all claims; tries with a fabricated entity; tries with a fabricated action. Each with an error bar and a link to examples.
- **On the trajectory page**, each claim is shown with its label, and fabricated values are highlighted where they appear.

## Constraints

- **The two code checks run on every try**, because they're free. The claim checker is the only part that spends calls.
- **The claim checker uses the judge model from the config**, not the agent model, and returns pass-or-fail style labels with a short reason, never a score.
- **Evidence is only what's in the trajectory**: tool results and the customer's messages. Not the model's general knowledge, and not the shop's database directly.
- **Amounts and dates are compared as values**, so "Rs 1,200", "1200" and "1,200 rupees" are the same, and "1 Oct" matches the stored date.
- **A value the customer gave counts as known**, even if no tool returned it. Repeating the customer's own order number isn't fabrication.
- Every code check has a must-fail and a must-pass test.
- The claim checker's output is validated with Zod. A malformed answer is recorded as "couldn't grade", never as supported.

## Acceptance check

1. `pnpm test` passes, with must-fail and must-pass tests for both code checks.
2. Build a trajectory by hand where the reply mentions order 9999, which never appeared. It's flagged as a fabricated entity.
3. Build one where the reply says "I've refunded you" with no refund call. It's flagged as a fabricated action.
4. Run the claim checker on the latest run (it prints its call estimate first). The report shows all four rates with error bars.
5. Open a trajectory with an unsupported claim. The claim is shown, labelled, with the checker's reason.
6. Regrade with the claim checker cached. No new calls.

## Not in this phase

The rubric judge for tone and refusals, checking whether the claim checker is right (Phase 9), the taxonomy.

## When you're done

Give me a 2 to 3 line summary of what was built in this phase.
