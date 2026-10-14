# Phase 1 — The shop and the agent

## Goal

You type a customer message into the terminal, and the agent looks things up in the shop's database, follows the policy, and replies, with every step printed as it happens.

## Where this starts

An empty repository with `AGENTS.md` and `docs/`, a fresh Next.js 16 app with Tailwind v4 and shadcn/ui, Node 22.13 or newer, and a Groq API key (console.groq.com) and a Gemini API key (Google AI Studio) in `.env.local`. Nothing else exists yet.

## Build

- **The shop's database.** Customers, products, orders, order items and refunds, in SQLite, with a stored "today" date. A seed file in the repository creates it: about 30 customers and 80 orders, spread across processing, shipped and delivered, with delivery dates on both sides of the 14-day refund line, a few partly refunded orders, and a few orders over Rs 10,000.
- **The policy**, as a short document the agent reads in its system prompt, with the eight rules from the project specs.
- **Seven tools**: find a customer by email, list a customer's orders, get one order, change an order's address, cancel an order, refund an order, transfer to a human. Each has a Zod input schema and a description. Each returns plain JSON, or an error the model can read.
- **The tools enforce the hard limits themselves.** Cancelling a shipped order, refunding more than what's left, or changing the address of a delivered order returns an error and changes nothing. The policy rules that need judgement (confirming first, looking up before acting, sending large refunds to a person) are the agent's job, not the tools'.
- **The agent loop.** Send the conversation and tools to the model, run the tools it asked for, add the results, repeat. Stop when it replies without a tool call, or at 12 steps. It reports each step as it happens, so the terminal now and the playground in Phase 2 can both show it live.
- **A chat command** that starts a fresh copy of the shop and lets you talk to the agent in the terminal. Each step prints as it happens: the model's text, each tool call with its inputs, each result.
- **The config file**: the agent's provider and model (Groq to start), temperature, step limit. **The system prompt and tool descriptions are versioned files**, with a version name the agent reports.

## Constraints

- **Write the loop yourself.** The AI SDK makes one model call per step. Its automatic multi-step tool loop isn't used, so nothing happens between steps that we didn't see.
- **Every chat gets a fresh copy of the seeded shop.** The seed itself is never changed by the agent.
- **The shop's "today" comes from the database**, never the computer's clock, so the 14-day rule gives the same answer next month.
- **A bad tool input becomes an error the model reads**, not a crash. Zod checks it before the tool runs.
- Money is whole rupees in integers.
- The model name and temperature come from the config file. None in the code.
- Configuration fails loudly at startup if the agent's API key is missing, with a line saying where to put it.
- A busy or rate-limit error from the provider shows as one plain line and keeps the conversation, so the message can be sent again.
- Keep the agent plain. No planning step, no memory, no extra framework.

## Acceptance check

1. Run the seed twice and compare the two database files. They're identical.
2. In the chat, give a customer's email and ask to cancel a processing order. The agent finds the customer, looks up the order, asks you to confirm, and cancels it when you say yes. Every step printed as it happened.
3. Ask to cancel a shipped order. The agent refuses and says why.
4. Ask for a refund on an order delivered 20 days before the shop's "today". Refused, with the 14-day reason.
5. Ask for a refund over Rs 10,000. The agent transfers you to a human instead of refunding.
6. Ask about an order belonging to a different customer's email. The agent doesn't act on it.
7. Start a new chat after step 2. The order you cancelled is back to processing: the new chat has a fresh shop.

## Not in this phase

Any screen, tasks, grading, running anything more than once, saving trajectories, Langfuse. Making the agent good: it only has to work end to end.

## When you're done

Give me a 2 to 3 line summary of what was built in this phase.
