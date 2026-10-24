// One online conversation: the simulated customer and the agent take turns on
// a fresh copy of the shop until the customer ends it, the turns run out, or
// the agent hits its step limit.
import type { ModelMessage } from "ai";
import { runAgentTurn, type AgentSetup, type ModelUsage } from "../agent/loop";
import { estimateTokens } from "../eval/pacer";
import type { Trajectory, TrajectoryEvent } from "../eval/trajectory";
import { getShopToday, openFreshShop, SEED_DB_PATH } from "../shop/db";
import { diffShops, dumpShop } from "../shop/diff";
import { customerInstructions, customerView, sendCustomer, type CustomerPrompt, type CustomerSettings, type Exchange } from "./customer";
import { StopTraffic, type PoolCaller } from "./pool";
import type { OnlineEnd, Persona } from "./schema";

export type OnlineSetup = {
  // The agent as configured; every call goes through `call`, so the model
  // here is only a placeholder.
  agent: Omit<AgentSetup, "wrapCall">;
  customer: CustomerSettings & { prompt: CustomerPrompt; maxTurns: number };
  call: PoolCaller;
  // For a failure that isn't a provider's (a bug shows here in plain words).
  describeError: (error: unknown) => string;
};

export type DrivenConversation = {
  status: "finished" | "errored";
  end: OnlineEnd | null;
  endReason: string | null;
  error: string | null;
  // Customer messages sent.
  turns: number;
  events: TrajectoryEvent[];
  // What the graders read; null when the conversation errored.
  trajectory: Trajectory | null;
  // Each of the customer's calls, so each is priced at the provider that answered it.
  customerCalls: { provider: string; usage: ModelUsage }[];
};

// A customer reply that can't go on the chat: the conversation errors.
class CustomerFailed extends Error {}

export async function runOnlineConversation(
  setup: OnlineSetup,
  goal: { persona: Persona; text: string },
  onEvent: (event: TrajectoryEvent) => void = () => {},
  seedPath: string = SEED_DB_PATH,
): Promise<DrivenConversation> {
  const { customer } = setup;
  const instructions = customerInstructions(customer.prompt, goal.persona, goal.text, customer.maxTurns);
  const events: TrajectoryEvent[] = [];
  const record = (event: TrajectoryEvent) => {
    events.push(event);
    onEvent(event);
  };
  const customerCalls: DrivenConversation["customerCalls"] = [];
  let turns = 0;

  const shop = openFreshShop(seedPath);
  try {
    const ctx = { db: shop.db, today: getShopToday(shop.db) };
    const before = dumpShop(shop.db);
    const agent: AgentSetup = {
      ...setup.agent,
      wrapCall: async (request, send) => ({ ...(await setup.call(estimateTokens(request), send)), cached: false }),
    };
    const messages: ModelMessage[] = [];
    const exchanges: Exchange[] = [];
    let end: OnlineEnd | null = null;
    let endReason: string | null = null;

    while (end === null) {
      if (turns === customer.maxTurns) {
        end = "turn-limit";
        break;
      }
      const request = { instructions, messages: customerView(customer.prompt.opener, exchanges) };
      const { result, provider } = await setup.call(estimateTokens(request), (model) => sendCustomer(model, request, customer));
      customerCalls.push({ provider, usage: result.usage });
      const reply = result.reply;
      if (reply.kind === "invalid") throw new CustomerFailed(`The simulated customer's reply couldn't be used: ${reply.why}.`);
      if (reply.kind === "end") {
        // Ending before saying anything leaves nothing to grade.
        if (turns === 0) throw new CustomerFailed("The simulated customer ended the chat before writing anything.");
        end = reply.outcome;
        endReason = reply.reason;
        break;
      }

      record({ type: "customer", text: reply.text });
      messages.push({ role: "user", content: reply.text });
      turns++;
      const turn = await runAgentTurn(agent, ctx, messages, record);
      if (turn.stopReason === "step-limit") {
        end = "step-limit";
        break;
      }
      exchanges.push({ customer: reply.text, agent: turn.reply });
    }

    const trajectory: Trajectory = { events, end: end === "step-limit" ? "step-limit" : "answered", changes: diffShops(before, dumpShop(shop.db)) };
    return { status: "finished", end, endReason, error: null, turns, events, trajectory, customerCalls };
  } catch (error) {
    // The batch stops; this conversation is dropped, not saved half-done.
    if (error instanceof StopTraffic) throw error;
    const message = error instanceof CustomerFailed ? error.message : setup.describeError(error);
    return { status: "errored", end: null, endReason: null, error: message, turns, events, trajectory: null, customerCalls };
  } finally {
    shop.dispose();
  }
}
