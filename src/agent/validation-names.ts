// The checks a version may run before a tool, by name. Kept apart from the
// checks themselves so the config can name them without loading the shop.
export const VALIDATION_NAMES = ["refund-limit"] as const;
export type ValidationName = (typeof VALIDATION_NAMES)[number];
