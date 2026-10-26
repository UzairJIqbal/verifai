import { APICallError, RetryError } from "ai";

// What a failed model call means for the run.
export type CallFailure =
  // This provider's free limit for today is used up: move to the next one.
  | { kind: "daily"; message: string }
  // Busy or a per-minute limit: try the next provider, or wait it out.
  // `limit` is true for a 429 (a limit), false for an overloaded provider.
  | { kind: "busy"; message: string; waitMs: number | null; limit: boolean }
  // The key, the model name or the account is wrong: every call would fail.
  | { kind: "config"; message: string }
  // The call got no answer at all: no status came back (DNS, a refused, reset
  // or timed-out connection) or the step timeout fired. That's the network,
  // not the agent, so the try isn't recorded and the next run redoes it.
  | { kind: "network"; message: string }
  // The provider answered, but not usefully (a 400, output it couldn't
  // parse): the try is recorded as errored and the run goes on.
  | { kind: "try"; message: string };

// Groq says which limit was hit, e.g. "Limit 200000, Used 199500 … on tokens
// per day (TPD)", and how long to wait, e.g. "Please try again in 1m2.5s".
// Cloudflare says "you have used up your daily free allocation of 10,000 neurons".
// Gemini names the quota, e.g. "GenerateRequestsPerDayPerProjectPerModel-FreeTier".
const DAILY = /per ?day|\(TPD\)|\(RPD\)|daily free allocation/i;
const TRY_AGAIN = /try again in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i;

function waitHint(error: APICallError): number | null {
  const header = error.responseHeaders?.["retry-after"];
  if (header !== undefined && /^\d+(\.\d+)?$/.test(header.trim())) return Math.ceil(Number(header) * 1000);
  const match = TRY_AGAIN.exec(`${error.message} ${error.responseBody ?? ""}`);
  if (!match || match[0].trim() === "try again in") return null;
  const [, h, m, s] = match;
  return Math.ceil(((Number(h ?? 0) * 60 + Number(m ?? 0)) * 60 + Number(s ?? 0)) * 1000);
}

export function classifyFailure(error: unknown, describe: (error: unknown) => string): CallFailure {
  const message = describe(error);
  const cause = RetryError.isInstance(error) ? error.lastError : error;
  if (cause instanceof Error && cause.name === "TimeoutError") return { kind: "network", message };
  if (!APICallError.isInstance(cause)) return { kind: "try", message };
  const status = cause.statusCode;
  // The AI SDK gives a call that never reached the provider no status.
  if (status === undefined) return { kind: "network", message };
  if (status === 429) {
    if (DAILY.test(`${cause.message} ${cause.responseBody ?? ""}`)) return { kind: "daily", message };
    return { kind: "busy", message, waitMs: waitHint(cause), limit: true };
  }
  if (status === 502 || status === 503 || status === 504) return { kind: "busy", message, waitMs: waitHint(cause), limit: false };
  if (status === 401 || status === 403 || status === 404) return { kind: "config", message };
  return { kind: "try", message };
}

export const BUSY_RETRIES = 3;
const BUSY_WAITS_MS = [15_000, 30_000, 60_000];
const LONGEST_WAIT_MS = 90_000;

// The provider's own hint when it gives one, else 15, 30, then 60 seconds.
export function busyWaitMs(failure: Extract<CallFailure, { kind: "busy" }>, attempt: number): number {
  const fallback = BUSY_WAITS_MS[Math.min(attempt, BUSY_WAITS_MS.length - 1)];
  return Math.min(LONGEST_WAIT_MS, failure.waitMs !== null ? failure.waitMs + 1000 : fallback);
}
