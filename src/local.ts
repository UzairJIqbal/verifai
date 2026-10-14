// Pages that spend model calls or write files only work on your machine.
// Vercel sets VERCEL=1 on every build and request, so a deployed site turns
// them off by itself, with nothing to remember to set.
export function isLocalOnlyEnabled(): boolean {
  return process.env.VERCEL !== "1";
}
