# Phase 2 — The UI: the shell and the playground

## Goal

You open VerifAI in the browser, chat with the agent in the playground, and watch every step it takes appear as it happens, in a shell that every later page will live in.

## Where this starts

The shop, the policy, the seven tools and the agent loop from Phase 1. You can chat with the agent only in the terminal, and there's no screen at all.

## Build

- **The shell, built once.** A header with the name, a theme control (follow the system, force light, force dark), and a navigation with places for: Playground, Tasks, Runs, Compare. Pages that don't exist yet show a friendly empty state saying which phase fills them. Later phases fill these places and add pages; they don't move them.
- **The colour tokens** from the project specs: greyscale surfaces, one blue accent for links, and green, red and amber kept for pass, fail and within-noise.
- **The playground page.** A chat box. You pick a customer email from a short list of seeded customers (or type one), write a message, and the conversation builds top to bottom: your message, the agent's reply, and each tool call as a small card with its inputs and its result. Each step appears as it happens, not all at the end.
- **A fresh shop per conversation**, as in the terminal. A "New conversation" button starts again from the seed.
- **A side panel** for the playground showing the order the agent is working on (status, total, refunded so far), read from this conversation's shop, so you can see the database change after a cancel or a refund.
- **A step counter and the versions in use** (model, prompt version, tool-description version) shown small at the top of the playground.
- **Plain-word errors.** A missing API key, a rate limit or a model error shows as a message in the chat that says what happened and what to do, never a blank screen.

## Constraints

- **All UI is built with the frontend design skill**, held to the interface rules in the project specs and AGENTS.md: a dense working tool, monospace for ids and tool inputs, colour only for status, nothing animated except new steps appearing.
- **The playground reuses the Phase 1 loop.** No second copy of the agent for the browser. If the loop needs a change to report steps, change it once.
- **The playground only works on your machine.** It spends model calls, so on a deployed site it's hidden. Build that switch now.
- **The API key never reaches the browser.** The model is called from server code only.
- Every page works at laptop width first, and still reads without sideways scrolling at 360 pixels wide.
- No grading, no saved conversations. The playground is for looking.

## Acceptance check

1. Open the app. The header, theme control and navigation are there. Tasks, Runs and Compare show an empty state saying which phase fills them.
2. In the playground, pick a customer and ask to cancel a processing order. Each step appears as it happens: the look-ups, the confirmation question, and after you say yes, the cancel call and its result.
3. The side panel shows the order changing from processing to cancelled.
4. Click "New conversation". The order is processing again.
5. Remove the API key and send a message. The chat shows a clear message about the missing key, not a crash.
6. Switch the theme, reload, and the choice holds. All three states work.
7. Open the page source and network tab. The API key isn't anywhere.

## Not in this phase

Tasks, scores, runs, saving anything, Langfuse, charts.

## When you're done

Give me a 2 to 3 line summary of what was built in this phase.
