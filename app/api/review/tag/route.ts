import { errorMessage, errorResponse, readBody } from "@/src/playground/http";
import { isLocalOnlyEnabled } from "@/src/local";
import { saveTag } from "@/src/review/save";
import { saveTagRequestSchema } from "@/src/review/schema";

// Writes to evals/review/: only on your own machine, checked here as well as on the page.
export async function POST(request: Request): Promise<Response> {
  if (!isLocalOnlyEnabled()) return errorResponse(404, "Tagging only runs on your own machine. Run `pnpm dev` there.");
  const body = await readBody(request, saveTagRequestSchema);
  if (!body.ok) return body.response;
  try {
    const outcome = saveTag(body.data, new Date());
    if (!outcome.ok) return errorResponse(outcome.status, outcome.error);
    return Response.json(outcome, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(500, `The tag wasn't saved: ${errorMessage(error)}`);
  }
}
