import { errorMessage, errorResponse, readBody } from "@/src/playground/http";
import { isLocalOnlyEnabled } from "@/src/local";
import { saveNote } from "@/src/review/save";
import { saveNoteRequestSchema } from "@/src/review/schema";

// Writes to evals/review/: only on your own machine, checked here as well as on the page.
export async function POST(request: Request): Promise<Response> {
  if (!isLocalOnlyEnabled()) return errorResponse(404, "The review queue only runs on your own machine. Run `pnpm dev` there.");
  const body = await readBody(request, saveNoteRequestSchema);
  if (!body.ok) return body.response;
  try {
    const outcome = saveNote(body.data, new Date());
    if (!outcome.ok) return errorResponse(outcome.status, outcome.error);
    return Response.json(outcome, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(500, `The note wasn't saved: ${errorMessage(error)}`);
  }
}
