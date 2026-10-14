import type { z } from "zod";

// Reads a streamed response one JSON line at a time, checking each line with
// the schema, and hands each one over as soon as it has fully arrived.
export async function readJsonLines<S extends z.ZodType>(
  body: ReadableStream<Uint8Array>,
  schema: S,
  onLine: (value: z.output<S>) => void,
  onBadLine: () => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const handle = (line: string) => {
    if (line.trim() === "") return;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      onBadLine();
      return;
    }
    const parsed = schema.safeParse(raw);
    if (parsed.success) onLine(parsed.data);
    else onBadLine();
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    // stream: true keeps a character split across two chunks intact.
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(handle);
  }
  handle(buffer + decoder.decode());
}

// The plain-words error a playground route sent, or a fallback.
export async function readApiError(response: Response, schema: z.ZodType<{ error: string }>): Promise<string> {
  try {
    const parsed = schema.safeParse(await response.json());
    if (parsed.success) return parsed.data.error;
  } catch {
    // Not JSON: fall through.
  }
  return `The server answered ${response.status}. Check the terminal running \`pnpm dev\`.`;
}
