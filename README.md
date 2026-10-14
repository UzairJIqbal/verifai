# VerifAI

**An evaluation system for a tool-using customer-support agent.**

A small AI agent answers customers of a made-up phone-accessories shop, *Volt & Case*, using tools over a SQLite database and a written policy. VerifAI runs that agent on a fixed set of tasks many times, records every step, checks the results with code wherever it can, counts hallucinations, and uses the failures to improve the agent without breaking what already worked.

The agent is deliberately plain. The grading system is the project.

> **Status: Phase 1 of 14 done.** The shop, the policy, the agent's tools and loop, and a terminal chat work. The runner, graders, statistics and dashboard come in later phases.

## What works today

- **A seeded shop.** 30 customers, 80 orders across processing, shipped and delivered, partial refunds, and orders over Rs 10,000. The seed is byte-for-byte reproducible, and the shop's "today" is a frozen date stored in the database, so the 14-day refund rule gives the same answer next month.
- **A written policy** of eight rules that the agent reads in its system prompt.
- **Seven tools** with Zod-validated inputs: find a customer, list their orders, get an order, change an address, cancel, refund, and transfer to a human. Hard limits are enforced by the tools themselves. Rules that need judgement, such as sending large refunds to a person, are left to the agent so they can be graded.
- **A hand-written agent loop.** One model call per step and at most 12 steps, with every step reported as it happens. The AI SDK never runs the tool loop on its own, so nothing happens that isn't recorded.
- **A terminal chat** on a fresh copy of the shop every time, printing each model reply, tool call and result live.

## Quick start

Needs Node 22.13 or newer and pnpm.

```bash
pnpm install
echo "GROQ_API_KEY=your-key" >> .env.local   # free key: https://console.groq.com/keys
pnpm seed                                     # builds data/shop.db
pnpm chat                                     # talk to the agent
```

Try: *"I'm aisha.khan@example.com, please cancel order 1001."*

| Command          | What it does                                         |
| ---------------- | ---------------------------------------------------- |
| `pnpm seed`      | Builds the seeded shop database                      |
| `pnpm chat`      | Chats with the agent in the terminal                 |
| `pnpm test`      | Runs the tests (no model calls)                      |
| `pnpm typecheck` | Checks the types                                     |

## Configuration

The agent's provider, model, temperature, step limit and timeout are in [`verifai.config.json`](verifai.config.json), never in code. The system prompt and tool descriptions are versioned files under [`agent/`](agent/), and the agent reports which version it runs.

## Stack

TypeScript (strict) · Vercel AI SDK · Groq for the agent, Gemini for the judge (both free tiers) · SQLite via `node:sqlite` · Zod · Vitest · tsx · Next.js 16 for the dashboard.

## How it's built

Spec-driven, one phase at a time. Each phase has a written spec with an acceptance check, and is committed only after that check passes.

- [`docs/project-specs.md`](docs/project-specs.md): what the project is and the reasoning behind every decision
- [`docs/specs/`](docs/specs/): one spec per phase
