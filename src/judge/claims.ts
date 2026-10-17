// The claim checker's request and the reading of its answer. Pure: the call
// itself, the cache and the pacing are in run-claims.ts.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { canonical } from "../canonical";
import { PROJECT_ROOT, type JudgeConfig } from "../config";
import type { Background } from "../graders/hallucination";
import { CLAIM_LABELS, type ClaimCheck, type Step } from "../results/schema";

export function loadClaimsPrompt(version: string): string {
  const path = join(PROJECT_ROOT, "judges", "claims", `${version}.md`);
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    throw new Error(`Couldn't read judges/claims/${version}.md. Check judge.claimsPromptVersion in verifai.config.json.`);
  }
}

export type ClaimsRequest = {
  // What the judge reads: the policy, the date and the conversation, each
  // step numbered as the try's recorded steps are, so a claim's step is the
  // same step the trajectory page shows.
  input: string;
  // The steps that are agent replies: the only ones a claim can come from.
  replySteps: number[];
};

// Evidence is only what's in the trajectory, plus the policy and date the
// agent was given. Never the shop's database.
export function claimsRequest(steps: Step[], background: Background): ClaimsRequest {
  const lines: string[] = [];
  const replySteps: number[] = [];
  steps.forEach((s, i) => {
    if (s.type === "customer") lines.push(`[step ${i}] CUSTOMER: ${s.text}`);
    else if (s.type === "tool-call") lines.push(`[step ${i}] TOOL CALL ${s.toolName} ${JSON.stringify(s.input)}`);
    else if (s.type === "tool-result") {
      lines.push(`[step ${i}] TOOL RESULT ${s.toolName}: ${s.outcome.ok ? JSON.stringify(s.outcome.value) : `ERROR ${s.outcome.error}`}`);
    } else if (s.type === "text") {
      replySteps.push(i);
      lines.push(`[step ${i}] AGENT REPLY: ${s.text}`);
    }
  });
  const input = [`TODAY: ${background.today}`, "", "POLICY:", background.policy, "", "CONVERSATION:", ...lines].join("\n");
  return { input, replySteps };
}

// The answer as asked for in the prompt. Its shape is also sent to Gemini as
// the structured output it must follow, but the answer is always checked here
// again: what's cached is the raw text, and it's read the same way each time.
export const claimsAnswerSchema = z.object({
  claims: z.array(
    z.object({
      step: z.number().int().nonnegative(),
      claim: z.string().trim().min(1),
      label: z.enum(CLAIM_LABELS),
      evidence: z.string().trim(),
      reason: z.string().trim().min(1),
    }),
  ),
});

export type JudgeSetup = Pick<JudgeConfig, "model" | "temperature" | "thinkingLevel"> & { promptVersion: string; prompt: string };

// Everything that decides the answer: change the model, the prompt's words or
// the conversation and it's a new call. The prompt's text is in the key, so
// an edit without a new version still isn't served an old answer.
export function claimsCacheKey(judge: JudgeSetup, request: ClaimsRequest): string {
  const parts = { kind: "claims", model: judge.model, temperature: judge.temperature, thinkingLevel: judge.thinkingLevel, prompt: judge.prompt, input: request.input };
  return createHash("sha256").update(canonical(parts)).digest("hex");
}

// A malformed answer is "couldn't grade", never "supported".
export function readClaimsAnswer(text: string, request: ClaimsRequest, judge: Pick<JudgeSetup, "model" | "promptVersion">): ClaimCheck {
  const meta = { model: judge.model, promptVersion: judge.promptVersion };
  const ungraded = (reason: string): ClaimCheck => ({ status: "ungraded", ...meta, reason });
  let raw: unknown;
  try {
    // Some answers come wrapped in a ```json fence.
    raw = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return ungraded(`the judge's answer isn't JSON: ${text.slice(0, 120) || "(empty)"}`);
  }
  const parsed = claimsAnswerSchema.safeParse(raw);
  if (!parsed.success) return ungraded(`the judge's answer doesn't have the asked-for shape: ${z.prettifyError(parsed.error).replace(/\n\s*/g, " ")}`);
  const stray = parsed.data.claims.find((c) => !request.replySteps.includes(c.step));
  if (stray) return ungraded(`the judge put a claim at step ${stray.step}, which isn't one of the agent's replies`);
  return {
    status: "checked",
    ...meta,
    claims: parsed.data.claims.map((c) => ({ step: c.step, text: c.claim, label: c.label, evidence: c.evidence, reason: c.reason })),
  };
}
