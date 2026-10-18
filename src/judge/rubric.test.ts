import { describe, expect, it } from "vitest";
import { loadConfig } from "../config";
import type { Step } from "../results/schema";
import type { JudgeSetup } from "./claims";
import { criteriaFor, judgeCacheKey, judgeRequest, loadRubric, readJudgeAnswer, rubricLabel } from "./rubric";

const judge = loadConfig().judge;
const rubric = loadRubric(judge.rubricVersion);
const setup: JudgeSetup = { model: judge.model, temperature: 0, thinkingLevel: judge.thinkingLevel, promptVersion: rubric.version, prompt: rubric.text };
const background = { policy: "Orders can be cancelled only while processing.", today: "2026-03-20" };

const steps = (...replies: string[]): Step[] => [{ type: "customer", text: "Please cancel order 1234." }, ...replies.map((text, i) => ({ type: "text" as const, step: i, text }))];
const refusing = { expected: { changes: [], facts: [], refusal: true } };
const ordinary = { expected: { changes: [], facts: [], refusal: false } };

describe("which criteria apply", () => {
  it("asks refusal explained only when the task expects a refusal and the reply gives one", () => {
    expect(criteriaFor(refusing, steps("I can't cancel it: it has already shipped."))).toEqual(["refusal-explained", "answered-question", "tone"]);
    // Expected a refusal but the agent went along with it: nothing refused to explain.
    expect(criteriaFor(refusing, steps("Done, order 1234 is cancelled."))).toEqual(["answered-question", "tone"]);
    // A "can't find" on an ordinary task isn't a refusal.
    expect(criteriaFor(ordinary, steps("I can't find that order, could you check the number?"))).toEqual(["answered-question", "tone"]);
  });

  it("judges nothing on a try with no reply", () => {
    expect(criteriaFor(refusing, steps())).toEqual([]);
  });
});

describe("the judge's request", () => {
  const request = judgeRequest(steps("I can't cancel it."), background, ["answered-question", "tone"]);

  it("lists the criteria to judge and never the expected answer", () => {
    expect(request.input).toContain("CRITERIA TO JUDGE: answered-question, tone");
    expect(request.input).not.toContain("refusal");
  });

  it("misses the cache when one word of the rubric changes, and shows a new version", () => {
    const edited = rubric.text.replace("polite and plain", "polite and clear");
    expect(edited).not.toBe(rubric.text);
    const changed = { ...setup, prompt: edited, promptVersion: rubricLabel(judge.rubricVersion, edited) };
    expect(changed.promptVersion).not.toBe(setup.promptVersion);
    expect(judgeCacheKey(changed, request)).not.toBe(judgeCacheKey(setup, request));
  });
});

describe("reading the judge's answer", () => {
  const request = judgeRequest(steps("I can't cancel it."), background, ["refusal-explained", "tone"]);
  const answer = (verdicts: object[]) => JSON.stringify({ verdicts });
  const v = (criterion: string, verdict = "pass") => ({ criterion, verdict, reason: "r" });

  it("reads pass and fail per criterion, in the rubric's order, with the rubric version", () => {
    const check = readJudgeAnswer(`\`\`\`json\n${answer([v("tone", "fail"), v("refusal-explained")])}\n\`\`\``, request, setup);
    expect(check).toEqual({
      status: "judged",
      model: setup.model,
      rubricVersion: setup.promptVersion,
      verdicts: [
        { criterion: "refusal-explained", pass: true, reason: "r" },
        { criterion: "tone", pass: false, reason: "r" },
      ],
    });
  });

  it.each([
    ["not JSON", "Looks good to me."],
    ["a score", answer([v("refusal-explained", "7/10"), v("tone")])],
    ["partly", answer([v("refusal-explained", "partial"), v("tone")])],
    ["no reason", JSON.stringify({ verdicts: [{ criterion: "tone", verdict: "pass", reason: "" }, v("refusal-explained")] })],
    ["a missing criterion", answer([v("tone")])],
    ["a criterion it wasn't asked", answer([v("refusal-explained"), v("tone"), v("answered-question")])],
    ["a criterion twice", answer([v("refusal-explained"), v("tone"), v("tone", "fail")])],
  ])("can't grade %s", (_, text) => {
    expect(readJudgeAnswer(text, request, setup).status).toBe("ungraded");
  });
});
