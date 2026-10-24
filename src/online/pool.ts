// Every model call of a traffic batch, the customer's and the agent's, one at
// a time through the agent's pool: the same per-minute pacing, daily counts,
// busy waits and fall-over to the next provider as the runner. No cache: a
// customer at temperature above 0 is meant to differ every time.
import type { LanguageModel } from "ai";
import type { ModelUsage } from "../agent/loop";
import type { PoolProvider } from "../eval/runner";
import type { Clock, Ticket } from "../eval/pacer";
import { BUSY_RETRIES, busyWaitMs, classifyFailure } from "../eval/provider-errors";

export type TrafficStopReason = "daily" | "busy" | "config" | "interrupted" | "cap";

// Stops the batch: no call can be sent now. Conversations already finished are kept.
export class StopTraffic extends Error {
  constructor(
    readonly reason: TrafficStopReason,
    message: string,
  ) {
    super(message);
  }
}

// This one call failed (a timeout, output the provider couldn't parse); the
// conversation errors and the batch goes on. The message is plain words.
export class CallFailed extends Error {}

export type PoolCall<T> = { result: T; provider: string; latencyMs: number };

export type PoolCaller = <T extends { usage: ModelUsage }>(guessedTokens: number, send: (model: LanguageModel) => Promise<T>) => Promise<PoolCall<T>>;

export function makePoolCaller(o: {
  pool: PoolProvider[];
  clock: Clock;
  stopRequested: () => boolean;
  // The most requests the batch may send, failed ones included. A hard stop,
  // whatever the estimate said.
  maxCalls: number;
  onNotice: (message: string) => void;
  // Every sent call, so the daily counts include traffic.
  record: (call: { at: number; provider: string; usage: ModelUsage }) => void;
}): PoolCaller {
  const exhausted = new Set<string>();
  const coolingUntil = new Map<string, number>();
  const limitErrorsInARow = new Map<string, number>();
  let sent = 0;
  const labels = o.pool.map((p) => p.label).join(" and ");
  const interrupted = () => new StopTraffic("interrupted", "Stopped by Ctrl-C.");

  const usedUp = (p: PoolProvider, guess: number): boolean => {
    const why = p.dailyLimitReached({ calls: 1, inputTokens: guess });
    if (why === null) return false;
    exhausted.add(p.provider);
    const takesOver = o.pool.find((q) => !exhausted.has(q.provider));
    o.onNotice(`${p.label}'s free limit for today is used up: ${why}${takesOver ? `; carrying on with ${takesOver.label}` : ""}.`);
    return true;
  };

  // The first provider in pool order with room now, waiting for a slot if
  // every ready one is at its per-minute limit. Null after a cool-down wait.
  const pick = async (guess: number): Promise<{ member: PoolProvider; ticket: Ticket } | null> => {
    for (const p of o.pool) if (!exhausted.has(p.provider)) usedUp(p, guess);
    const open = o.pool.filter((p) => !exhausted.has(p.provider));
    if (open.length === 0) throw new StopTraffic("daily", `The free limit for today is used up on every provider in the pool (${labels}).`);
    const now = o.clock.now();
    const ready = open.filter((p) => (coolingUntil.get(p.provider) ?? 0) <= now);
    if (ready.length === 0) {
      await o.clock.sleep(Math.max(50, Math.min(...open.map((p) => coolingUntil.get(p.provider) ?? now)) - now));
      return null;
    }
    for (const member of ready) {
      const ticket = member.pacer.tryReserve(guess);
      if (ticket) return { member, ticket };
    }
    const ticket = await ready[0].pacer.reserve(guess, o.stopRequested);
    if (ticket === null) throw interrupted();
    return { member: ready[0], ticket };
  };

  return async (guess, send) => {
    const busyTimes = new Map<string, number>();
    let busyInAll = 0;
    for (;;) {
      if (o.stopRequested()) throw interrupted();
      const picked = await pick(guess);
      if (picked === null) continue;
      const { member, ticket } = picked;
      if (sent >= o.maxCalls) {
        ticket.settle(null);
        throw new StopTraffic("cap", `The batch reached its cap of ${o.maxCalls} calls (online.maxCallsPerBatch in verifai.config.json).`);
      }
      sent++;
      const began = o.clock.now();
      try {
        const result = await send(member.model);
        limitErrorsInARow.set(member.provider, 0);
        ticket.settle(result.usage);
        o.record({ at: began, provider: member.provider, usage: result.usage });
        return { result, provider: member.provider, latencyMs: Math.round(o.clock.now() - began) };
      } catch (error) {
        // A refused request still took a slot this minute, but no tokens.
        ticket.settle(null);
        const failure = classifyFailure(error, member.describeError);
        const takesOver = o.pool.find((p) => p !== member && !exhausted.has(p.provider));
        const inARow = failure.kind === "busy" && failure.limit ? (limitErrorsInARow.get(member.provider) ?? 0) + 1 : 0;
        limitErrorsInARow.set(member.provider, inARow);
        if (member.dailyAfterLimitErrors !== null && inARow >= member.dailyAfterLimitErrors) {
          exhausted.add(member.provider);
          o.onNotice(
            `${member.label} refused ${inARow} calls in a row with a limit error, so its free limit for today counts as used up` +
              `${takesOver ? `; carrying on with ${takesOver.label}` : ""}.`,
          );
          continue;
        }
        if (failure.kind === "daily") {
          exhausted.add(member.provider);
          o.onNotice(`${member.label}'s free limit for today is used up${takesOver ? `; carrying on with ${takesOver.label}` : ""}. ${failure.message}`);
          continue;
        }
        if (failure.kind === "busy") {
          busyInAll++;
          if (busyInAll > BUSY_RETRIES * o.pool.length) throw new StopTraffic("busy", `${labels} stayed busy through ${busyInAll - 1} retries. ${failure.message}`);
          const times = busyTimes.get(member.provider) ?? 0;
          busyTimes.set(member.provider, times + 1);
          const wait = busyWaitMs(failure, times);
          coolingUntil.set(member.provider, Math.max(coolingUntil.get(member.provider) ?? 0, o.clock.now() + wait));
          const next = o.pool.find((p) => p !== member && !exhausted.has(p.provider) && (coolingUntil.get(p.provider) ?? 0) <= o.clock.now());
          o.onNotice(`${member.label} is busy or rate limiting; ${next ? `sending to ${next.label} instead.` : `waiting ${Math.round(wait / 1000)}s, then retrying.`}`);
          continue;
        }
        if (failure.kind === "config") throw new StopTraffic("config", failure.message);
        throw new CallFailed(failure.message);
      }
    }
  };
}
