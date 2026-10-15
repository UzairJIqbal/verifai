// The last line of defence for "an API key never appears in a step, a trace, a
// results file or a log": every string the runner writes passes through here.
// Keys never go into a prompt, so this should never fire; if it does, the key
// is replaced rather than written.
export type Redact = (text: string) => string;

export const REDACTED = "[redacted]";

export function makeRedactor(secrets: ReadonlyArray<string | undefined>): Redact {
  // Very short values would match ordinary text; no real key is that short.
  const known = [...new Set(secrets.filter((s): s is string => s !== undefined && s.length >= 8))];
  if (known.length === 0) return (text) => text;
  return (text) => known.reduce((out, secret) => out.replaceAll(secret, REDACTED), text);
}
