// What the labelling page and its route send each other. Both sides use these
// schemas. Browser-safe: no Node modules here.
import { z } from "zod";
import { CLAIM_LABELS, JUDGE_CRITERIA } from "../results/schema";
import { JUDGE_SPLITS } from "./schema";

// Your label for the trial the page was offered. Claims are labelled in the
// checker's order, by position: the server fills in their words.
export const saveLabelRequestSchema = z.object({
  runId: z.string().min(1),
  taskId: z.string().min(1),
  tryNumber: z.number().int().positive(),
  criteria: z.array(z.object({ criterion: z.enum(JUDGE_CRITERIA), pass: z.boolean() })),
  claims: z.array(z.enum(CLAIM_LABELS)),
});
export type SaveLabelRequest = z.infer<typeof saveLabelRequestSchema>;

// The judges' answers, sent only after your label is saved, and only for a
// judge-dev trial.
export const revealSchema = z.object({
  criteria: z.array(z.object({ criterion: z.enum(JUDGE_CRITERIA), yours: z.boolean(), judge: z.boolean(), reason: z.string() })),
  claims: z.array(z.object({ step: z.number().int(), text: z.string(), yours: z.enum(CLAIM_LABELS), judge: z.enum(CLAIM_LABELS), reason: z.string() })),
});
export type Reveal = z.infer<typeof revealSchema>;

export const saveLabelResponseSchema = z.object({ split: z.enum(JUDGE_SPLITS), reveal: revealSchema.nullable() });
export type SaveLabelResponse = z.infer<typeof saveLabelResponseSchema>;
