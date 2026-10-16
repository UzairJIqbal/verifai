// What a task is. Browser-safe: no Node modules here, so the tasks page can
// use the types. Reading the tasks file is the loader's job alone.
import { z } from "zod";

export const CATEGORIES = ["cancel", "refund", "address", "status", "transfer"] as const;
export type Category = (typeof CATEGORIES)[number];

export const SPLITS = ["dev", "holdout"] as const;
export type Split = (typeof SPLITS)[number];

export const DIFFICULTIES = ["easy", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

// The tables a task may expect to change. The rest (products, customers,
// order_items, shop_meta) have no tool that writes them, so any change there
// is always an extra one.
const changeTable = z.enum(["orders", "refunds", "transfers"]);
const cell = z.union([z.string(), z.number().int()]);

// "This row now has these values": only the named columns may change, and
// they must end up with exactly these values.
const updateChange = z.strictObject({
  op: z.literal("update"),
  table: changeTable,
  key: z.record(z.string(), cell).refine((key) => Object.keys(key).length > 0, "a key needs at least one column"),
  set: z.record(z.string(), cell).refine((set) => Object.keys(set).length > 0, "set needs at least one column"),
});

// "This row was added": a new row whose named columns have these values.
// Columns left out (a generated id, a free-text reason) can be anything.
const insertChange = z.strictObject({
  op: z.literal("insert"),
  table: changeTable,
  values: z.record(z.string(), cell),
});

export const expectedChangeSchema = z.discriminatedUnion("op", [updateChange, insertChange]);
export type ExpectedChange = z.infer<typeof expectedChangeSchema>;

// Something the agent's replies must say. Each is matched loosely enough that
// "Rs 1,200" and "1200 rupees" both count.
export const factSchema = z.union([
  z.strictObject({ money: z.number().int().positive() }),
  z.strictObject({ date: z.iso.date() }),
  // Any one of these phrases, ignoring case.
  z.strictObject({ text: z.array(z.string().trim().min(1)).min(1) }),
]);
export type Fact = z.infer<typeof factSchema>;

// The tool calls that solve the task, run by hand on a fresh shop to check
// that `changes` is right. Never shown to the agent.
const referenceCall = z.strictObject({ tool: z.string().min(1), input: z.record(z.string(), z.json()) });

export const taskSchema = z.strictObject({
  id: z.string().regex(/^[a-z]+-\d{2}$/, "an id looks like cancel-01"),
  split: z.enum(SPLITS),
  category: z.enum(CATEGORIES),
  difficulty: z.enum(DIFFICULTIES),
  adversarial: z.boolean(),
  // What the task is testing, in one line, for whoever reads the task list.
  note: z.string().trim().min(1),
  first_message: z.string().trim().min(1),
  // Sent in order, one each time the agent ends a turn with a question.
  canned_replies: z.array(z.string().trim().min(1)),
  expected: z.strictObject({
    // The whole difference from the seed. Empty means nothing may change.
    changes: z.array(expectedChangeSchema),
    facts: z.array(factSchema).default([]),
    refusal: z.boolean().default(false),
  }),
  reference: z.array(referenceCall),
});
export type Task = z.infer<typeof taskSchema>;

// The first line of the tasks file.
export const taskFileHeaderSchema = z.strictObject({ dataset_version: z.string().regex(/^v\d+$/, "looks like v1") });
