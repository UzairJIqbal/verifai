import type { TrialStatus } from "@/src/results/schema";

// Shown in UTC so the server and the browser print the same thing.
export const formatWhen = (iso: string) => `${iso.slice(0, 16).replace("T", " ")} UTC`;
export const formatCount = (value: number) => value.toLocaleString("en-US");
export const formatPercent = (part: number, whole: number) => (whole === 0 ? "–" : `${((part / whole) * 100).toFixed(1)}%`);
// Tokens that count toward the free limit: cached input doesn't.
export const countedTokens = (u: { inputTokens: number; cachedInputTokens: number; outputTokens: number }) =>
  u.inputTokens - u.cachedInputTokens + u.outputTokens;

// Errored is a not-pass too, so it shares the fail colour; the word tells them apart.
export const STATUS_CLASS: Record<TrialStatus, string> = { passed: "text-pass", failed: "text-fail", errored: "text-fail" };
