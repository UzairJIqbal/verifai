// Shared by the playground's routes: refuse when deployed, read a body with
// Zod, and answer failures in words the page can show as they are.
import type { z } from "zod";
import { isLocalOnlyEnabled } from "../local";

export function errorResponse(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

// Nothing on the deployed site may call a model, so the routes check too,
// not only the page.
export function refuseIfDeployed(): Response | null {
  return isLocalOnlyEnabled() ? null : errorResponse(404, "The playground only runs on your own machine. Run `pnpm dev` there.");
}

export async function readBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ ok: true; data: z.output<S> } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: errorResponse(400, "The request body isn't valid JSON.") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, response: errorResponse(400, "The request was malformed. Reload the page and try again.") };
  return { ok: true, data: parsed.data };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const CONVERSATION_GONE =
  "This conversation is no longer on the server (it restarted, or too many were open). Click New conversation.";
