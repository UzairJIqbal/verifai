// The order failed tries are offered in: a fixed hash of each trial's id.
// Random, but the same every time, so a reload offers the same try and
// there's no skipping to an easier one. The report picks its examples in
// the same order, so they aren't chosen either.
import { createHash } from "node:crypto";
import { trialKey, type TrialRef } from "./schema";

export const reviewOrderKey = (t: TrialRef): string => createHash("sha256").update(`verifai review order:${trialKey(t)}`).digest("hex");
export const byReviewOrder = (a: TrialRef, b: TrialRef): number => (reviewOrderKey(a) < reviewOrderKey(b) ? -1 : 1);
