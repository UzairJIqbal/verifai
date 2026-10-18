import { errorMessage, errorResponse, readBody } from "@/src/playground/http";
import { isLocalOnlyEnabled } from "@/src/local";
import { saveLabelRequestSchema } from "@/src/labels/protocol";
import { saveLabel } from "@/src/labels/save";

// Writes to evals/labels/: only on your own machine, checked here as well as on the page.
export async function POST(request: Request): Promise<Response> {
  if (!isLocalOnlyEnabled()) return errorResponse(404, "Labelling only runs on your own machine. Run `pnpm dev` there.");
  const body = await readBody(request, saveLabelRequestSchema);
  if (!body.ok) return body.response;
  try {
    const outcome = saveLabel(body.data, new Date());
    if (!outcome.ok) return errorResponse(outcome.status, outcome.error);
    return Response.json(outcome.response, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(500, `The label wasn't saved: ${errorMessage(error)}`);
  }
}
