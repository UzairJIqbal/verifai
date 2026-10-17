// The hallucination section in words and as a table: the same in the
// terminal, report.md and the run page. Browser-safe.
import { withInterval } from "../stats/format";
import type { Estimate } from "../stats/stats";
import type { HallucinationReport } from "./schema";

const orDash = (e: Estimate | null) => (e === null ? "–" : withInterval(e));

// What each hallucination rate counts, in words: the same in the terminal,
// report.md and the run page.
export const HALLUCINATION_DEFINITIONS = {
  fabricatedEntity: "Tries where the agent wrote an order number, customer id, email, amount or date (in a reply or a tool input) that no tool result, customer message or the policy had shown before it. Checked by code on every try.",
  fabricatedAction: "Tries where a reply says an action was done (refunded, cancelled, address changed, passed to a person) with no successful call of the tool that does it. Checked by code on every try.",
  responses: "Agent replies with at least one claim the judge labelled unsupported or contradicted, over every reply in the tries it read.",
  claims: "Claims labelled unsupported (nothing in the evidence states it or lets you work it out), over every claim the judge split the replies into. Contradicted claims are counted beside it, not in it.",
} as const;

// The four rates as one table, the same in the terminal and report.md.
export function hallucinationTable(h: HallucinationReport): { header: string[]; rows: string[][] } {
  const c = h.claims;
  const notRead = ["–", "–", "–", "not checked yet: run `pnpm claims`"];
  return {
    header: ["", "tasks", "tries", "count", "rate"],
    rows: [
      ["fabricated entity", String(h.fabricatedEntity.tasks), String(h.fabricatedEntity.tries), `${h.fabricatedEntity.hits}/${h.fabricatedEntity.tries} tries`, orDash(h.fabricatedEntity.rate)],
      ["fabricated action", String(h.fabricatedAction.tasks), String(h.fabricatedAction.tries), `${h.fabricatedAction.hits}/${h.fabricatedAction.tries} tries`, orDash(h.fabricatedAction.rate)],
      c === null
        ? ["replies with a bad claim", ...notRead]
        : ["replies with a bad claim", String(c.responses.tasks), String(c.responses.tries), `${c.responses.flagged}/${c.responses.replies} replies`, orDash(c.responses.rate)],
      c === null
        ? ["unsupported claims", ...notRead]
        : ["unsupported claims", String(c.claims.tasks), String(c.claims.tries), `${c.claims.unsupported}/${c.claims.total} claims (${c.claims.contradicted} contradicted)`, orDash(c.claims.rate)],
    ],
  };
}

// Who read the claims and how much of the run, or why the claim rows are empty.
export function claimCoverage(h: HallucinationReport): string {
  const c = h.claims;
  if (c === null) return "The claim checker hasn't read this run. `pnpm claims <run>` sends about one judge call per try.";
  const left = c.checkable - c.checked - c.ungraded;
  return (
    `Claims read by ${c.judges.join(", ")}: ${c.checked} of ${c.checkable} tries checked` +
    (c.ungraded > 0 ? `, ${c.ungraded} couldn't be graded (counted apart, never as clean)` : "") +
    (left > 0 ? `, ${left} not read yet (\`pnpm claims\` carries on)` : "") +
    "."
  );
}
