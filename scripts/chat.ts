// `pnpm chat`: talk to the agent in the terminal, on a fresh copy of the shop.
// Every step is printed the moment it happens.
import { createInterface } from "node:readline";
import { styleText } from "node:util";
import type { ModelMessage } from "ai";
import { loadConfig, requireApiKey, type Config } from "../src/config";
import { getShopToday, openFreshShop, type Shop } from "../src/shop/db";
import { loadAgentVersion } from "../src/agent/versions";
import { agentProvider, createAgentModel, describeModelError } from "../src/agent/model";
import { runAgentTurn, type AgentEvent, type AgentSetup } from "../src/agent/loop";
import type { ToolContext } from "../src/agent/tools";

const dim = (text: string) => styleText("dim", text);

// A "waiting" line while a model call is out, so a slow answer doesn't look
// like a freeze. It's wiped as soon as anything else is printed.
let waiting = false;
let providerLabel = "the model";
function showWaiting(step: number): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write(dim(`  ${String(step).padStart(2)} … waiting for ${providerLabel}`));
  waiting = true;
}
function clearWaiting(): void {
  if (!waiting) return;
  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);
  waiting = false;
}

function printEvent(event: AgentEvent): void {
  clearWaiting();
  const step = dim(`  ${String(event.step).padStart(2)} `);
  if (event.type === "text") {
    console.log(`${step}${styleText("bold", "agent ›")} ${event.text.trim()}`);
  } else if (event.type === "tool-call") {
    console.log(`${step}${styleText("cyan", `→ ${event.toolName}`)} ${JSON.stringify(event.input)}`);
  } else if (event.outcome.ok) {
    console.log(`${step}${styleText("green", "←")} ${dim(JSON.stringify(event.outcome.value))}`);
  } else {
    console.log(`${step}${styleText("red", `✗ ${event.outcome.error}`)}`);
  }
}

function fatal(message: string): never {
  console.error(styleText("red", `✗ ${message}`));
  process.exit(1);
}

function start(): { config: Config; shop: Shop; setup: AgentSetup; ctx: ToolContext } {
  try {
    const config = loadConfig();
    const provider = agentProvider(config);
    providerLabel = provider.label;
    const apiKey = requireApiKey(provider);
    const shop = openFreshShop();
    const today = getShopToday(shop.db);
    const setup: AgentSetup = {
      model: createAgentModel(config, apiKey),
      temperature: config.agent.temperature,
      maxSteps: config.agent.maxSteps,
      stepTimeoutMs: config.agent.stepTimeoutSeconds * 1000,
      version: loadAgentVersion(config, today),
    };
    console.log(styleText("bold", "VerifAI chat · Volt & Case support"));
    console.log(dim(`  agent ${setup.version.label} · ${provider.label} ${config.agent.model} · temperature ${config.agent.temperature}`));
    console.log(dim(`  fresh copy of the seeded shop · shop today ${today} · up to ${setup.maxSteps} steps per reply`));
    console.log(dim("  Type a message. /exit or Ctrl-D to leave.\n"));
    return { config, shop, setup, ctx: { db: shop.db, today } };
  } catch (error) {
    fatal(error instanceof Error ? error.message : String(error));
  }
}

async function main(): Promise<void> {
  const { config, shop, setup, ctx } = start();
  const messages: ModelMessage[] = [];
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt(styleText("bold", "you › "));
  rl.on("SIGINT", () => rl.close());
  // Ctrl-D can close the input while the agent is still answering.
  let closed = false;
  rl.on("close", () => (closed = true));
  const prompt = () => {
    if (!closed) rl.prompt();
  };
  prompt();

  for await (const line of rl) {
    const text = line.trim();
    if (text === "/exit") break;
    if (text === "") {
      prompt();
      continue;
    }

    const before = messages.length;
    messages.push({ role: "user", content: text });
    try {
      const result = await runAgentTurn(setup, ctx, messages, printEvent, showWaiting);
      clearWaiting();
      if (result.stopReason === "step-limit") {
        console.log(styleText("yellow", `  Stopped after ${result.steps} steps without a reply (the step limit).`));
      } else if (result.reply.trim() === "") {
        console.log(styleText("yellow", "  The agent sent an empty reply."));
      }
    } catch (error) {
      clearWaiting();
      // Drop the half-finished turn so the conversation stays consistent.
      messages.length = before;
      console.log(styleText("red", `  ✗ ${describeModelError(error, config)}`));
      console.log(dim("  Your message wasn't answered. Send it again to retry."));
    }
    console.log();
    prompt();
  }

  rl.close();
  shop.dispose();
  console.log(dim("Chat ended. The shop copy was thrown away; the seed is unchanged."));
}

void main();
