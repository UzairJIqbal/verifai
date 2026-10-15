// How hard the agent's model thinks before it answers. Its own file, with no
// Node modules, so the results schema (which the browser loads) can use it too.
export const REASONING_EFFORTS = ["low", "medium", "high"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];
