import { savedResponseSchema } from "@/src/review/schema";

// Sends a note or a tag; null when it was saved, otherwise what to tell you.
export async function postReview(path: string, body: unknown): Promise<string | null> {
  try {
    const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      return typeof json === "object" && json !== null && "error" in json && typeof json.error === "string" ? json.error : `The server answered ${response.status}.`;
    }
    if (!savedResponseSchema.safeParse(json).success) return "It was sent, but the server's answer didn't make sense. Reload the page to see whether it was saved.";
    return null;
  } catch {
    return "Couldn't reach the server. Check `pnpm dev` is still running, then try again.";
  }
}
