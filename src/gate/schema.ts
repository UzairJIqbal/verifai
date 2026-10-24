// What a gate decided, as saved under results/gates/. Browser-safe: zod only,
// so the gates page can use the types.
import { z } from "zod";
import { CATEGORIES } from "../tasks/schema";

const estimate = z.object({ value: z.number(), lo: z.number(), hi: z.number() });

// One slice of promoted (A) against candidate (B). A floor that couldn't be
// had is null, never a number standing in for it.
export const gateRowSchema = z.object({
  tasks: z.number().int().nonnegative(),
  aRate: z.number(),
  bRate: z.number(),
  difference: estimate,
  p: z.number(),
  floor: z.number().nullable(),
  verdict: z.enum(["better", "worse", "within-noise", "no-noise-floor"]),
  // How far a category row could drop before the gate failed it (D-002).
  // Absent on overall rows, and on records from before D-002, when every
  // category's limit was maxCategoryDropPoints.
  dropLimit: z.number().optional(),
});
export type GateRow = z.infer<typeof gateRowSchema>;

const comparisonSchema = z.object({ overall: gateRowSchema, byCategory: z.partialRecord(z.enum(CATEGORIES), gateRowSchema) });

export const gateRecordSchema = z.object({
  name: z.string(),
  decidedAt: z.string(),
  passed: z.boolean(),
  // Whether the passed candidate is now the promoted version. False on a
  // pass only if promotion broke halfway, which the gate reports loudly.
  promoted: z.boolean(),
  basedOn: z.string(),
  change: z.string(),
  why: z.string(),
  targets: z.string(),
  // The latest taxonomy's top category when the gate ran.
  topCategory: z.string(),
  promotedLabel: z.string(),
  candidateLabel: z.string(),
  datasetVersion: z.string(),
  triesPerTask: z.number().int().positive(),
  runs: z.object({ promotedDev: z.string(), candidateDev: z.string(), promotedHoldout: z.string(), candidateHoldout: z.string() }),
  // Where the floor came from, and its size before rescaling.
  floor: z.object({ configKey: z.string(), measuredAt: z.string(), datasetVersion: z.string(), runs: z.tuple([z.string(), z.string()]), tasks: z.number().int(), overall: z.number() }),
  dev: comparisonSchema,
  holdout: comparisonSchema,
  maxCategoryDropPoints: z.number(),
  checks: z.array(z.object({ id: z.string(), label: z.string(), pass: z.boolean(), detail: z.string() })),
});
export type GateRecord = z.infer<typeof gateRecordSchema>;

// The id of a gate's section on the gates page, so other pages can link to it.
export const gateAnchor = (g: Pick<GateRecord, "name" | "decidedAt">): string => `gate-${g.name}-${g.decidedAt.replace(/[^0-9]/g, "").slice(0, 14)}`;
