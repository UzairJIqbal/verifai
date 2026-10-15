import { loadConfig, type Config } from "@/src/config";
import { describeModelError, firstInPool } from "@/src/agent/model";
import { runAgentTurn, type AgentSetup } from "@/src/agent/loop";
import { buildAgentSetup, finishTurn, getConversation } from "@/src/playground/conversations";
import { CONVERSATION_GONE, errorMessage, errorResponse, readBody, refuseIfDeployed } from "@/src/playground/http";
import { messageRequestSchema, type TurnEvent } from "@/src/playground/protocol";

// Answers one customer message with the Phase 1 agent loop, streaming each
// step as one line of JSON the moment the loop reports it.
export async function POST(request: Request): Promise<Response> {
  const refused = refuseIfDeployed();
  if (refused) return refused;
  const body = await readBody(request, messageRequestSchema);
  if (!body.ok) return body.response;
  const { conversationId, text } = body.data;
  const conversation = getConversation(conversationId);
  if (!conversation) return errorResponse(404, CONVERSATION_GONE);
  if (conversation.busy) return errorResponse(409, "The agent is still answering the last message. Wait for it to finish.");
  conversation.busy = true;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: TurnEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      const before = conversation.messages.length;
      try {
        // Setup errors (no key, a broken config) come out as a chat message
        // like any other failure, with the user's message already shown.
        let config: Config;
        let setup: AgentSetup;
        try {
          config = loadConfig();
          setup = buildAgentSetup(config, conversation.ctx.today);
        } catch (error) {
          send({ type: "error", message: errorMessage(error) });
          return;
        }
        conversation.messages.push({ role: "user", content: text });
        try {
          const result = await runAgentTurn(
            setup,
            conversation.ctx,
            conversation.messages,
            // The playground shows steps, not token counts or timings.
            (event) => {
              if (event.type === "text" || event.type === "tool-call") send(event);
              else if (event.type === "tool-result") {
                const { step, toolCallId, toolName, outcome } = event;
                send({ type: "tool-result", step, toolCallId, toolName, outcome });
              }
            },
            (step) => send({ type: "waiting", step }),
          );
          send({ type: "done", stopReason: result.stopReason, steps: result.steps, reply: result.reply });
        } catch (error) {
          // Drop the half-finished turn so the conversation stays consistent,
          // the same as the terminal chat.
          conversation.messages.length = before;
          send({ type: "error", message: describeModelError(error, firstInPool(config), config.agent.stepTimeoutSeconds) });
        }
      } finally {
        finishTurn(conversationId, conversation);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
