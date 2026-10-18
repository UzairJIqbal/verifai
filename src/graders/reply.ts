// The reply grader: the agent's replies state the facts the task requires, and
// give the refusal it requires. Plain text checks, no model.
import { formatRupees } from "../shop/money";
import type { Trajectory, Verdict } from "../eval/trajectory";
import { fails, passes } from "./steps";
import type { Fact, Task } from "../tasks/schema";

// A refusal is any of these. Only tasks that require one look for it, and the
// state grader separately checks that nothing was done.
const REFUSAL_PHRASES = [
  "can't", "cannot", "can not", "unable to", "not able to", "won't be able", "isn't possible", "not possible",
  "isn't eligible", "not eligible", "ineligible", "isn't allowed", "not allowed", "not permitted",
  "can only", "only be", "outside the", "no longer", "unfortunately", "i'm sorry, but",
];

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

// Lower case, straight apostrophes, plain hyphens, single spaces, and no
// thousands commas ("1,200" → "1200"), so each check below has one form to look
// for. The model often writes "2026‑03‑14" with non-breaking hyphens (U+2011)
// or U+2010; they read the same, so they count the same. Dashes ("5–7") stay.
export function normalizeReply(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[\u2010\u2011]/g, "-")
    .replace(/(\d),(?=\d)/g, "$1")
    .replace(/\s+/g, " ");
}

function statesMoney(text: string, amount: number): boolean {
  const n = String(amount);
  // "Rs 1200", "Rs. 1200", "PKR 1200", "₨1200", or "1200 rupees", "1200 Rs".
  const before = new RegExp(`(?:\\brs\\.?|\\bpkr|₨)\\s*${n}(?:\\.0+)?(?!\\d)`);
  const after = new RegExp(`(?<![\\d.])${n}(?:\\.0+)?(?:/-)?\\s*(?:rupees|rs\\b|pkr\\b)`);
  return before.test(text) || after.test(text);
}

function statesDate(text: string, iso: string): boolean {
  if (text.includes(iso)) return true;
  const [, month, day] = iso.split("-").map(Number);
  const name = MONTHS[month - 1];
  const monthName = `(?:${name}|${name.slice(0, 3)}\\.?)`;
  const dayNum = `0?${day}(?:st|nd|rd|th)?`;
  // "14 March", "14th of Mar", "March 14", "Mar 14th".
  return (
    new RegExp(`(?<!\\d)${dayNum}(?: of)? ${monthName}\\b`).test(text) || new RegExp(`\\b${monthName} ${dayNum}(?!\\d)`).test(text)
  );
}

export function describeFact(fact: Fact): string {
  if ("money" in fact) return formatRupees(fact.money);
  if ("date" in fact) return fact.date;
  return fact.text.map((t) => `"${t}"`).join(" or ");
}

export function statesFact(text: string, fact: Fact): boolean {
  if ("money" in fact) return statesMoney(text, fact.money);
  if ("date" in fact) return statesDate(text, fact.date);
  return fact.text.some((phrase) => text.includes(normalizeReply(phrase)));
}

export function givesRefusal(text: string): boolean {
  return REFUSAL_PHRASES.some((phrase) => text.includes(phrase));
}

// Everything the agent said to the customer over the whole conversation counts:
// a fact stated while confirming is still stated.
export function gradeReply(task: Task, trajectory: Trajectory): Verdict {
  const { facts, refusal } = task.expected;
  if (facts.length === 0 && !refusal) return passes("reply", "nothing required of the reply");

  const said = normalizeReply(
    trajectory.events.flatMap((e) => (e.type === "text" ? [e.text] : [])).join("\n"),
  );
  const problems = facts.filter((f) => !statesFact(said, f)).map((f) => `never states ${describeFact(f)}`);
  if (refusal && !givesRefusal(said)) problems.push("never refuses");
  if (problems.length > 0) return fails("reply", problems.join("; "), null);

  const parts = [...(facts.length > 0 ? [`states all ${facts.length} fact(s)`] : []), ...(refusal ? ["refuses"] : [])];
  return passes("reply", parts.join(", "));
}
