// The playground's live conversations, held in the dev server's memory. Each
// one owns a fresh copy of the seeded shop, like a terminal chat does. Nothing
// is saved: a restart of the server ends every conversation.
import { randomUUID } from "node:crypto";
import type { ModelMessage } from "ai";
import type { Config } from "../config";
import { getShopToday, openFreshShop, type Shop } from "../shop/db";
import { connectAgent, firstInPool } from "../agent/model";
import { loadAgentVersion } from "../agent/versions";
import type { AgentSetup } from "../agent/loop";
import type { ToolContext } from "../agent/tools";

export type Conversation = {
  shop: Shop;
  ctx: ToolContext;
  messages: ModelMessage[];
  // One turn at a time: a second message while the agent works is refused.
  busy: boolean;
};

// Only a handful are kept, so forgotten browser tabs can't pile up shop copies.
const MAX_CONVERSATIONS = 8;

// Kept on globalThis so a hot reload in development doesn't lose open chats.
declare global {
  var verifaiConversations: Map<string, Conversation> | undefined;
}
const conversations = (globalThis.verifaiConversations ??= new Map<string, Conversation>());

export function startConversation(replace?: string): string {
  if (replace !== undefined) endConversation(replace);
  while (conversations.size >= MAX_CONVERSATIONS) {
    const oldest = conversations.keys().next().value;
    if (oldest === undefined) break;
    endConversation(oldest);
  }
  const shop = openFreshShop();
  const id = randomUUID();
  conversations.set(id, { shop, ctx: { db: shop.db, today: getShopToday(shop.db) }, messages: [], busy: false });
  return id;
}

export function getConversation(id: string): Conversation | undefined {
  return conversations.get(id);
}

function endConversation(id: string): void {
  const conversation = conversations.get(id);
  if (!conversation) return;
  conversations.delete(id);
  // A turn still running keeps its shop until it finishes (see finishTurn).
  if (!conversation.busy) conversation.shop.dispose();
}

// Called when a turn ends. If the conversation was replaced meanwhile, its
// shop copy is thrown away now.
export function finishTurn(id: string, conversation: Conversation): void {
  conversation.busy = false;
  if (conversations.get(id) !== conversation) conversation.shop.dispose();
}

// Built for every turn from a freshly read config, so an edit to the config
// or the key takes effect on the next message without restarting the server.
export function buildAgentSetup(config: Config, today: string): AgentSetup {
  // The playground talks to the first provider in the pool and doesn't switch.
  const agent = connectAgent(firstInPool(config));
  return {
    model: agent.model,
    provider: agent.provider,
    temperature: config.agent.temperature,
    maxSteps: config.agent.maxSteps,
    stepTimeoutMs: config.agent.stepTimeoutSeconds * 1000,
    reasoningEffort: config.agent.reasoningEffort,
    version: loadAgentVersion(config, today),
  };
}
