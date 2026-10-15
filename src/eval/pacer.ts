// Keeps model calls under one provider's per-minute limits, so the free tier
// answers instead of turning us away with 429s. A sliding one-minute window:
// a call waits until both the requests and the tokens in the last 60 seconds
// leave room for it.
//
// Three things keep our count close to the provider's own:
// - it starts from the calls already made in the last minute (an earlier run,
//   the one just stopped), not from an empty window;
// - after each call, the provider says how many tokens it has left this
//   minute; anything it counted that we didn't (the playground, another
//   terminal) is booked too;
// - the guess for a call before it's sent is scaled by how far off past
//   guesses were.
export type Clock = { now: () => number; sleep: (ms: number) => Promise<void> };

// Null tokens: the provider has no per-minute token limit.
export type PerMinuteLimits = { requestsPerMinute: number; tokensPerMinute: number | null };

// A little under the real limit, for the calls our guess undershoots.
const HEADROOM = 0.9;
const WINDOW_MS = 60_000;

type Entry = { at: number; tokens: number };

export type CallUsage = { inputTokens: number; cachedInputTokens: number; outputTokens: number };

// Settle with the call's usage once it's back, or null if it was refused.
export type Ticket = { settle: (usage: CallUsage | null) => void };

// Cached input doesn't count toward the provider's limits.
export const countedTokens = (u: CallUsage): number => u.inputTokens - u.cachedInputTokens + u.outputTokens;

export class Pacer {
  private entries: Entry[];
  private readonly requests: number;
  private readonly tokens: number;
  // Real tokens over guessed tokens, summed over every call sent.
  private guessed = 0;
  private actual = 0;

  constructor(
    private readonly limits: PerMinuteLimits,
    private readonly clock: Clock,
    // Calls made in the last minute before this pacer started.
    recent: Entry[] = [],
  ) {
    this.requests = Math.max(1, Math.floor(limits.requestsPerMinute * HEADROOM));
    this.tokens = limits.tokensPerMinute === null ? Infinity : Math.max(1, Math.floor(limits.tokensPerMinute * HEADROOM));
    this.entries = recent.map((e) => ({ ...e }));
  }

  // Before any call has come back, the guess is taken as it is.
  private get scale(): number {
    return this.guessed === 0 ? 1 : this.actual / this.guessed;
  }

  /**
   * Books one call guessed at `guessedTokens` if there's room for it now, and
   * returns null if not. The ticket replaces the booking with the real count
   * once it's known.
   */
  tryReserve(guessedTokens: number): Ticket | null {
    // A cache hit can't be counted on, so the booking assumes none.
    const booked = Math.ceil(guessedTokens * this.scale);
    const now = this.prune();
    // A call bigger than the whole budget still goes, alone in the window,
    // rather than waiting forever.
    const fits = this.entries.length === 0 || (this.entries.length < this.requests && this.used() + booked <= this.tokens);
    if (!fits) return null;
    const entry: Entry = { at: now, tokens: booked };
    this.entries.push(entry);
    return {
      settle: (usage) => {
        if (usage === null) {
          entry.tokens = 0;
          return;
        }
        entry.tokens = countedTokens(usage);
        this.guessed += guessedTokens;
        this.actual += usage.inputTokens + usage.outputTokens;
      },
    };
  }

  /** Waits for room for one call, then books it. Null if `stopped` turns true while waiting. */
  async reserve(guessedTokens: number, stopped: () => boolean = () => false): Promise<Ticket | null> {
    for (;;) {
      if (stopped()) return null;
      const ticket = this.tryReserve(guessedTokens);
      if (ticket) return ticket;
      // Wait until the oldest booking leaves the window, then look again.
      await this.clock.sleep(Math.max(50, this.entries[0].at + WINDOW_MS - this.clock.now() + 10));
    }
  }

  /**
   * The provider's own count of tokens left this minute, read off a reply.
   * If it has counted more than we have, the difference was spent somewhere
   * we can't see, and is booked now so the next calls wait for it.
   */
  observeRemaining(remainingTokens: number): void {
    if (this.limits.tokensPerMinute === null) return;
    const now = this.prune();
    const unseen = this.limits.tokensPerMinute - remainingTokens - this.used();
    if (unseen > 0) this.entries.push({ at: now, tokens: unseen });
  }

  private prune(): number {
    const now = this.clock.now();
    this.entries = this.entries.filter((e) => e.at > now - WINDOW_MS);
    return now;
  }

  private used(): number {
    return this.entries.reduce((sum, e) => sum + e.tokens, 0);
  }
}

// Roughly four characters to a token, plus room for the answer. The pacer
// corrects it from real counts as calls come back.
export function estimateTokens(request: unknown): number {
  return Math.ceil(JSON.stringify(request).length / 4) + 300;
}
