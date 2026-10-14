import { getConversation } from "@/src/playground/conversations";
import { CONVERSATION_GONE, errorMessage, errorResponse, readBody, refuseIfDeployed } from "@/src/playground/http";
import { shopRequestSchema } from "@/src/playground/protocol";
import { readShopSnapshot } from "@/src/playground/snapshot";

// The side panel's view of this conversation's shop: the picked customer's
// orders and the order the agent is working on.
export async function POST(request: Request): Promise<Response> {
  const refused = refuseIfDeployed();
  if (refused) return refused;
  const body = await readBody(request, shopRequestSchema);
  if (!body.ok) return body.response;
  const conversation = getConversation(body.data.conversationId);
  if (!conversation) return errorResponse(404, CONVERSATION_GONE);
  try {
    return Response.json(readShopSnapshot(conversation.shop.db, { email: body.data.email, orderId: body.data.orderId }));
  } catch (error) {
    return errorResponse(500, `Couldn't read the shop: ${errorMessage(error)}`);
  }
}
