// The two free hallucination checks. Both read only the trajectory, the
// policy and the shop's date: never the shop's database, since the question is
// whether the agent had seen a value, not whether the value is real.
//
// Fabricated entity: an order number, customer id, email, amount or date the
// agent wrote (in a reply or a tool call's input) that hadn't appeared before
// that point in a tool result, a customer message or the policy. "Before" is
// on purpose: a tool's error echoes its input ("Order 9999 does not exist"),
// and that echo mustn't make the made-up input it came from look known.
//
// Fabricated action: the agent says it did something ("I've refunded you")
// with no successful call to the tool that does it.
import type { Trajectory, TrajectoryEvent, ValueSpan, Verdict } from "../eval/trajectory";
import { fails, passes, succeeded, toolCalls } from "./steps";

export const FABRICATED_ENTITY = "fabricated-entity";
export const FABRICATED_ACTION = "fabricated-action";

export type EntityKind = "order" | "customer" | "email" | "amount" | "date";

// One value pulled out of some text. `key` is what's compared: a number for
// orders and amounts, upper case for ids, lower case for emails, and for
// dates either "YYYY-MM-DD" or "MM-DD" when no year was written. `text` is
// the value as written, for highlighting.
export type Entity = { kind: EntityKind; key: string; text: string };

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH = `(${MONTHS.map((m) => `${m}|${m.slice(0, 3)}`).join("|")})\\.?`;
const DAY = "(\\d{1,2})(?:st|nd|rd|th)?";
const YEAR = "(?:,?\\s+(\\d{4}))?";
// "1,200" and "1200" both; a decimal tail of zeros is dropped.
const NUMBER = "(\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.0+)?(?![\\d.]*\\d)";
// Markdown emphasis around a value: "**#1005**".
const MARK = "[*_`]*";

const pad = (n: number) => String(n).padStart(2, "0");
const toNumberKey = (raw: string) => String(Number(raw.replace(/,/g, "")));

function monthDay(monthName: string, day: string, year: string | undefined): string | null {
  const month = MONTHS.findIndex((m) => m.startsWith(monthName.toLowerCase().slice(0, 3))) + 1;
  const d = Number(day);
  if (month === 0 || d < 1 || d > 31) return null;
  return year ? `${year}-${pad(month)}-${pad(d)}` : `${pad(month)}-${pad(d)}`;
}

const PATTERNS: { kind: EntityKind; re: RegExp; key: (m: RegExpExecArray) => string | null; text?: (m: RegExpExecArray) => string }[] = [
  { kind: "email", re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, key: (m) => m[0].toLowerCase() },
  { kind: "customer", re: /\bC\d{3,}\b/gi, key: (m) => m[0].toUpperCase() },
  // "Rs 1,200", "Rs. 1200", "PKR 1200", "₨1200".
  { kind: "amount", re: new RegExp(`(?:\\brs\\.?|\\bpkr|₨)\\s*${MARK}${NUMBER}`, "gi"), key: (m) => toNumberKey(m[1]) },
  // "1,200 rupees", "1200 Rs", "1200/-".
  { kind: "amount", re: new RegExp(`(?<![\\d.,])${NUMBER}(?:/-)?\\s*(?:rupees\\b|rs\\b|pkr\\b)`, "gi"), key: (m) => toNumberKey(m[1]) },
  { kind: "date", re: /\b(\d{4})-(\d{2})-(\d{2})\b/g, key: (m) => `${m[1]}-${m[2]}-${m[3]}` },
  // "14 March", "14th of Mar 2026".
  { kind: "date", re: new RegExp(`(?<!\\d)${DAY}(?: of)? ${MONTH}\\b${YEAR}`, "gi"), key: (m) => monthDay(m[2], m[1], m[3]) },
  // "March 14", "Mar 14th, 2026".
  { kind: "date", re: new RegExp(`\\b${MONTH} ${DAY}(?!\\d)${YEAR}`, "gi"), key: (m) => monthDay(m[1], m[2], m[3]) },
];

// An order number is only read where it's called one: after "order" (with
// "number", "no.", "id" or "#" between), or straight after "#". A bare number
// in a sentence could be anything. "orders 1005 and 1007" reads both.
const ORDER_LEAD = new RegExp(`\\border(?:s)?${MARK}\\s*(?:(?:number|no\\.?|id)\\s*)?(?::\\s*)?#?${MARK}(\\d{3,})`, "gi");
const HASH = new RegExp(`(?<![\\w&])#${MARK}(\\d{3,})\\b`, "g");
const LIST_TAIL = new RegExp(`^(?:${MARK}\\s*(?:,|and|or|&)\\s*#?${MARK}(\\d{3,}))`, "i");

function orderNumbers(text: string): Entity[] {
  const found: Entity[] = [];
  for (const m of text.matchAll(ORDER_LEAD)) {
    found.push({ kind: "order", key: toNumberKey(m[1]), text: m[1] });
    let rest = text.slice((m.index ?? 0) + m[0].length);
    for (let tail = LIST_TAIL.exec(rest); tail; tail = LIST_TAIL.exec(rest)) {
      found.push({ kind: "order", key: toNumberKey(tail[1]), text: tail[1] });
      rest = rest.slice(tail[0].length);
    }
  }
  for (const m of text.matchAll(HASH)) found.push({ kind: "order", key: toNumberKey(m[1]), text: m[1] });
  return found;
}

// Every entity written in a piece of text, each once.
export function extractEntities(text: string): Entity[] {
  const found: Entity[] = [...orderNumbers(text)];
  for (const p of PATTERNS) {
    for (const m of text.matchAll(p.re)) {
      const key = p.key(m);
      if (key !== null) found.push({ kind: p.kind, key, text: m[0].trim() });
    }
  }
  const seen = new Set<string>();
  return found.filter((e) => {
    const id = `${e.kind}:${e.key}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

// What's been seen so far in a try. Numbers are kept as one set for orders
// and amounts alike: a tool result's number is known whatever it was.
// A day count the policy states ("within 14 days of delivery").
const POLICY_DAYS = /\b(\d{1,3})\s*(?:calendar\s+)?days?\b/gi;

const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

class Known {
  // The one kind of value the agent may work out rather than read: a date
  // that is a known date plus a day count from the policy (delivery + 14 days
  // is the refund deadline). Nothing else derived counts.
  private readonly policyDays = new Set<number>();
  private readonly numbers = new Set<string>();
  private readonly strings = new Set<string>();
  private readonly dates = new Set<string>();
  private readonly monthDays = new Set<string>();

  addEntity(e: Entity): void {
    if (e.kind === "order" || e.kind === "amount") this.numbers.add(e.key);
    else if (e.kind === "date") this.addDate(e.key);
    else this.strings.add(e.key);
  }

  addDate(key: string): void {
    if (key.length === 10) {
      this.dates.add(key);
      this.monthDays.add(key.slice(5));
    } else {
      this.monthDays.add(key);
    }
  }

  // Free text the agent didn't write: every entity in it, and every whole
  // number, so a number the customer typed without saying "order" still counts.
  addText(text: string): void {
    for (const e of extractEntities(text)) this.addEntity(e);
    for (const m of text.matchAll(/\d{1,3}(?:,\d{3})+|\d+/g)) this.numbers.add(toNumberKey(m[0]));
  }

  // A tool result, all the way down. Dates may carry a time ("2026-03-01T…").
  addValue(value: unknown): void {
    if (typeof value === "number") this.numbers.add(String(value));
    else if (typeof value === "string") {
      this.addText(value);
      const iso = /^(\d{4}-\d{2}-\d{2})/.exec(value);
      if (iso) this.addDate(iso[1]);
    } else if (Array.isArray(value)) value.forEach((v) => this.addValue(v));
    else if (value !== null && typeof value === "object") Object.values(value).forEach((v) => this.addValue(v));
  }

  addPolicy(policy: string): void {
    this.addText(policy);
    for (const m of policy.matchAll(POLICY_DAYS)) this.policyDays.add(Number(m[1]));
  }

  has(e: Entity): boolean {
    if (e.kind === "order" || e.kind === "amount") return this.numbers.has(e.key);
    if (e.kind === "date") return e.key.length === 10 ? this.dates.has(e.key) || this.derived().has(e.key) : this.monthDays.has(e.key) || this.derivedMonthDays().has(e.key);
    return this.strings.has(e.key);
  }

  private derived(): Set<string> {
    const out = new Set<string>();
    for (const d of this.dates) for (const n of this.policyDays) out.add(addDays(d, n));
    return out;
  }

  private derivedMonthDays(): Set<string> {
    return new Set([...this.derived()].map((d) => d.slice(5)));
  }
}

// The structured inputs a tool call can carry. Anything else that's a string
// (an address, a reason, a summary) is read as free text.
function inputEntities(input: unknown): Entity[] {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return [];
  return Object.entries(input).flatMap(([key, value]): Entity[] => {
    if (key === "order_id" && typeof value === "number") return [{ kind: "order", key: String(value), text: String(value) }];
    if (key === "amount" && typeof value === "number") return [{ kind: "amount", key: String(value), text: String(value) }];
    if (key === "customer_id" && typeof value === "string") return [{ kind: "customer", key: value.trim().toUpperCase(), text: value }];
    if (key === "email" && typeof value === "string") return [{ kind: "email", key: value.trim().toLowerCase(), text: value }];
    return typeof value === "string" ? extractEntities(value) : [];
  });
}

// What the agent didn't write and could have read: the policy and the shop's date.
export type Background = { policy: string; today: string };

export type Fabrication = { step: number; entity: Entity };

export function findFabricatedEntities(events: TrajectoryEvent[], background: Background): Fabrication[] {
  const known = new Known();
  known.addPolicy(background.policy);
  known.addDate(background.today);
  const found: Fabrication[] = [];
  events.forEach((e, step) => {
    if (e.type === "customer") known.addText(e.text);
    else if (e.type === "tool-result") known.addValue(e.outcome.ok ? e.outcome.value : e.outcome.error);
    else if (e.type === "text" || e.type === "tool-call") {
      const written = e.type === "text" ? extractEntities(e.text) : inputEntities(e.input);
      for (const entity of written) if (!known.has(entity)) found.push({ step, entity });
    }
  });
  return found;
}

const describeEntity = (e: Entity) => (e.kind === "order" ? `order ${e.key}` : e.kind === "customer" ? `customer ${e.key}` : `${e.kind} "${e.text}"`);

export function gradeFabricatedEntities(trajectory: Trajectory, background: Background): Verdict {
  const found = findFabricatedEntities(trajectory.events, background);
  if (found.length === 0) return passes(FABRICATED_ENTITY, "every value written had appeared in a tool result, a customer message or the policy first");
  const listed = found.map((f) => `${describeEntity(f.entity)} (step ${f.step})`).join(", ");
  return { ...fails(FABRICATED_ENTITY, `never seen before it was written: ${listed}`, found[0].step), spans: found.map((f) => ({ step: f.step, text: f.entity.text })) };
}

// The phrases that claim an action, each with the tool it needs. First person
// in the past ("I've refunded", "I cancelled"): "I can refund" or "I haven't
// cancelled" don't match, since nothing but these words can sit between the
// subject and the verb. A passive refund or cancel ("has been cancelled") is
// left out because the agent may be reading an order's existing status back.
const ACTION_TOOLS_BY_PHRASE: { tool: string; verb: string }[] = [
  { tool: "refund_order", verb: "refunded|(?:issued|processed|initiated|sent)\\s+(?:a|the|your|you\\s+a)\\s+(?:full\\s+|partial\\s+)?refund" },
  { tool: "cancel_order", verb: "cancell?ed" },
  { tool: "update_order_address", verb: "(?:updated|changed)\\s+(?:the\\s+|your\\s+)?(?:delivery\\s+|shipping\\s+)?address" },
  { tool: "transfer_to_human", verb: "transferred|escalated|forwarded|passed\\s+(?:this|it|that|your\\s+\\w+|the\\s+\\w+)\\s+(?:on|along|to)|handed\\s+(?:this|it|you|that)\\s+(?:over|to)" },
];
const SUBJECT = "\\b(?:i['’]ve|i\\s+have|i|we['’]ve|we\\s+have|we)\\s+(?:(?:just|now|already|successfully|also|gone\\s+ahead\\s+and)\\s+)*";

const PASSIVE: { tool: string; re: RegExp }[] = [
  { tool: "update_order_address", re: /\baddress\s+(?:has\s+been|was|is\s+now)\s+(?:successfully\s+)?(?:updated|changed)\b/gi },
  { tool: "transfer_to_human", re: /\b(?:has|have)\s+been\s+(?:successfully\s+)?(?:escalated|passed\s+on|forwarded|transferred|handed\s+over)\b/gi },
];

export type ClaimedAction = { tool: string; text: string };

export function claimedActions(text: string): ClaimedAction[] {
  const active = ACTION_TOOLS_BY_PHRASE.flatMap(({ tool, verb }) =>
    [...text.matchAll(new RegExp(`${SUBJECT}(?:${verb})\\b`, "gi"))].map((m) => ({ tool, text: m[0] })),
  );
  const passive = PASSIVE.flatMap(({ tool, re }) => [...text.matchAll(re)].map((m) => ({ tool, text: m[0] })));
  return [...active, ...passive];
}

export function gradeFabricatedActions(trajectory: Trajectory): Verdict {
  const done = new Set(toolCalls(trajectory.events).filter(succeeded).map((c) => c.name));
  const found: (ClaimedAction & { step: number })[] = trajectory.events.flatMap((e, step) =>
    e.type === "text" ? claimedActions(e.text).filter((a) => !done.has(a.tool)).map((a) => ({ ...a, step })) : [],
  );
  if (found.length === 0) return passes(FABRICATED_ACTION, "every action the agent said it took has a successful call behind it");
  const listed = found.map((f) => `"${f.text}" with no successful ${f.tool} (step ${f.step})`).join(", ");
  const spans: ValueSpan[] = found.map((f) => ({ step: f.step, text: f.text }));
  return { ...fails(FABRICATED_ACTION, `said it acted without doing it: ${listed}`, found[0].step), spans };
}
