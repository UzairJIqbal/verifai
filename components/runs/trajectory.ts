import type { Step, TrialVerdict } from "@/src/results/schema";
import type { TranscriptItem } from "@/components/playground/transcript";

// A recorded try as the playground's rows: each tool call becomes one card
// holding its result, and each model call a line with its tokens and time.
export function stepsToItems(steps: Step[]): TranscriptItem[] {
  const items: TranscriptItem[] = [];
  const cards = new Map<string, Extract<TranscriptItem, { kind: "tool" }>>();
  steps.forEach((s, i) => {
    const id = String(i);
    switch (s.type) {
      case "customer":
        items.push({ kind: "user", id, who: "customer", text: s.text });
        break;
      case "model":
        items.push({
          kind: "call",
          id,
          step: s.step,
          provider: s.provider,
          inputTokens: s.usage.inputTokens,
          cachedInputTokens: s.usage.cachedInputTokens,
          outputTokens: s.usage.outputTokens,
          latencyMs: s.latencyMs,
          replayed: s.cached,
        });
        break;
      case "text":
        items.push({ kind: "agent", id, step: s.step, text: s.text });
        break;
      case "tool-call": {
        const card: Extract<TranscriptItem, { kind: "tool" }> = { kind: "tool", id, step: s.step, toolName: s.toolName, input: s.input };
        cards.set(s.toolCallId, card);
        items.push(card);
        break;
      }
      case "tool-result": {
        const card = cards.get(s.toolCallId);
        if (card) {
          card.outcome = s.outcome;
          card.latencyMs = s.latencyMs;
        } else {
          // Never expected; shown rather than dropped so a broken record is visible.
          items.push({ kind: "notice", id, tone: "error", text: `A result for ${s.toolName} arrived with no matching call (${s.toolCallId}).` });
        }
        break;
      }
    }
  });
  return items;
}

// Each verdict that points at a step, under the row showing it. A tool
// call's result is shown in its call's card, so a verdict pointing at the
// result lands on the call: the last row at or before its step.
export function verdictsByItem(items: TranscriptItem[], verdicts: TrialVerdict[]): Map<string, TrialVerdict[]> {
  const out = new Map<string, TrialVerdict[]>();
  for (const v of verdicts) {
    if (v.step === null) continue;
    const step = v.step;
    const item = items.filter((i) => Number(i.id) <= step).at(-1);
    if (item) out.set(item.id, [...(out.get(item.id) ?? []), v]);
  }
  return out;
}
