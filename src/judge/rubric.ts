// The AI judge's request and the reading of its answer. Pure apart from
// reading the rubric file: the call itself, the cache and the pacing are in
// run-calls.ts.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { canonical } from "../canonical";
import { PROJECT_ROOT } from "../config";
import type { Background } from "../graders/hallucination";
import { givesRefusal, normalizeReply } from "../graders/reply";
import { JUDGE_CRITERIA, type JudgeCheck, type JudgeCriterion, type Step } from "../results/schema";
import type { Task } from "../tasks/schema";
import type { JudgeSetup } from "./claims";
import { conversationRequest } from "./conversation";

export type Rubric = { version: string; text: string };

// The version shown everywhere is the file's version and the start of a hash
// of its words: change one word in v1.md and it reads as a different rubric,
// even if the version wasn't bumped.
export function loadRubric(version: string): Rubric {
  const file = `judges/rubric/${version}.md`;
  let text: string;
  try {
    text = readFileSync(join(PROJECT_ROOT, file), "utf8").trim();
  } catch {
    throw new Error(`Couldn't read ${file}. Check judge.rubricVersion in verifai.config.json.`);
  }
  // A criterion the code asks about with no section in the rubric would be
  // judged against nothing.
  const missing = JUDGE_CRITERIA.filter((c) => !new RegExp(`^## ${c}$`, "m").test(text));
  if (missing.length > 0) throw new Error(`${file} has no section for ${missing.join(", ")}. Each criterion needs a "## <criterion>" heading.`);
  return { version: rubricLabel(version, text), text };
}

export const rubricLabel = (version: string, text: string): string => `${version} · ${createHash("sha256").update(text).digest("hex").slice(0, 6)}`;

const replies = (steps: Step[]) => steps.flatMap((s) => (s.type === "text" ? [s.text] : []));

// Which criteria a try is judged on, decided by code. Refusal explained only
// where the task expects a refusal and the replies give one (the same phrases
// the reply grader looks for): a try that never refused has no refusal to
// explain, and a "can't find that" on an ordinary task isn't one. A try with
// no reply has nothing to judge.
export function criteriaFor(task: Pick<Task, "expected">, steps: Step[]): JudgeCriterion[] {
  const said = replies(steps);
  if (said.length === 0) return [];
  const refused = task.expected.refusal && givesRefusal(normalizeReply(said.join("\n")));
  return JUDGE_CRITERIA.filter((c) => c !== "refusal-explained" || refused);
}

export type JudgeRequest = { input: string; criteria: JudgeCriterion[] };

// The conversation and the criteria to judge. Never the task's expected
// answer: the judge reads the reply, not whether it matches a key.
export function judgeRequest(steps: Step[], background: Background, criteria: JudgeCriterion[]): JudgeRequest {
  const { input } = conversationRequest(steps, background);
  return { input: `${input}\n\nCRITERIA TO JUDGE: ${criteria.join(", ")}`, criteria };
}

// The answer as the rubric asks for it. Sent to Gemini as the structured
// output it must follow, and always checked again here: what's cached is the
// raw text, read the same way each time.
export const judgeAnswerSchema = z.object({
  verdicts: z.array(
    z.object({
      criterion: z.enum(JUDGE_CRITERIA),
      verdict: z.enum(["pass", "fail"]),
      reason: z.string().trim().min(1),
    }),
  ),
});

// Everything that decides the answer: the model, the rubric's words and
// version, and the request. Change one word of the rubric and it's a new call.
export function judgeCacheKey(judge: JudgeSetup, request: JudgeRequest): string {
  const parts = {
    kind: "judge",
    model: judge.model,
    temperature: judge.temperature,
    thinkingLevel: judge.thinkingLevel,
    rubricVersion: judge.promptVersion,
    rubric: judge.prompt,
    input: request.input,
  };
  return createHash("sha256").update(canonical(parts)).digest("hex");
}

// A malformed answer is "couldn't grade", never a pass. So is one that skips
// a criterion it was asked, judges one it wasn't, or judges one twice.
export function readJudgeAnswer(text: string, request: JudgeRequest, judge: Pick<JudgeSetup, "model" | "promptVersion">): JudgeCheck {
  const meta = { model: judge.model, rubricVersion: judge.promptVersion };
  const ungraded = (reason: string): JudgeCheck => ({ status: "ungraded", ...meta, reason });
  let raw: unknown;
  try {
    // Some answers come wrapped in a ```json fence.
    raw = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return ungraded(`the judge's answer isn't JSON: ${text.slice(0, 120) || "(empty)"}`);
  }
  const parsed = judgeAnswerSchema.safeParse(raw);
  if (!parsed.success) return ungraded(`the judge's answer doesn't have the asked-for shape: ${z.prettifyError(parsed.error).replace(/\n\s*/g, " ")}`);
  const given = parsed.data.verdicts.map((v) => v.criterion);
  const extra = given.filter((c) => !request.criteria.includes(c));
  if (extra.length > 0) return ungraded(`the judge judged ${extra.join(", ")}, which it wasn't asked to`);
  const twice = given.find((c, i) => given.indexOf(c) !== i);
  if (twice) return ungraded(`the judge judged ${twice} twice`);
  const missing = request.criteria.filter((c) => !given.includes(c));
  if (missing.length > 0) return ungraded(`the judge didn't judge ${missing.join(", ")}`);
  // In the order the criteria are listed, whatever order the judge used.
  const verdicts = request.criteria.flatMap((criterion) =>
    parsed.data.verdicts.filter((v) => v.criterion === criterion).map((v) => ({ criterion, pass: v.verdict === "pass", reason: v.reason })),
  );
  return { status: "judged", ...meta, verdicts };
}

// One criterion's section of the rubric, without its heading: what the
// labelling page shows next to that criterion, so you label by the same words.
export function rubricSection(text: string, criterion: JudgeCriterion): string {
  const start = text.search(new RegExp(`^## ${criterion}$`, "m"));
  if (start === -1) return "";
  const body = text.slice(start).replace(/^## .*\n/, "");
  const end = body.search(/^## /m);
  return (end === -1 ? body : body.slice(0, end)).trim();
}
