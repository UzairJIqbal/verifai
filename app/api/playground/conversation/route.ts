import { startConversation } from "@/src/playground/conversations";
import { errorMessage, errorResponse, readBody, refuseIfDeployed } from "@/src/playground/http";
import { conversationRequestSchema } from "@/src/playground/protocol";

// Starts a conversation on a fresh copy of the seeded shop, ending the one it
// replaces ("New conversation").
export async function POST(request: Request): Promise<Response> {
  const refused = refuseIfDeployed();
  if (refused) return refused;
  const body = await readBody(request, conversationRequestSchema);
  if (!body.ok) return body.response;
  try {
    return Response.json({ conversationId: startConversation(body.data.replace) });
  } catch (error) {
    return errorResponse(500, errorMessage(error));
  }
}
