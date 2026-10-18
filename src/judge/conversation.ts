// A try as a judge model reads it: the policy, the date and the conversation,
// each step numbered as the try's recorded steps are, so a step a judge
// points at is the same step the trajectory page shows. Pure.
import type { Background } from "../graders/hallucination";
import type { Step } from "../results/schema";

export type ConversationRequest = {
  input: string;
  // The steps that are agent replies.
  replySteps: number[];
};

// Never the shop's database or the task's expected answer: only what the
// agent itself was given and saw.
export function conversationRequest(steps: Step[], background: Background): ConversationRequest {
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
