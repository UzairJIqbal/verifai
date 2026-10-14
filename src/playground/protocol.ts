// What the playground's browser page and its server routes send each other.
// Both sides use these schemas, so nothing crosses the wire unchecked.
// This file is imported by the browser: no Node modules here.
import { z } from "zod";

const toolOutcome = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: z.json() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type ToolOutcome = z.infer<typeof toolOutcome>;

// One line of the streamed reply. The first four mirror the agent loop's
// own events; "done" and "error" end the stream.
export const turnEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("waiting"), step: z.number().int() }),
  z.object({ type: z.literal("text"), step: z.number().int(), text: z.string() }),
  z.object({
    type: z.literal("tool-call"),
    step: z.number().int(),
    toolCallId: z.string(),
    toolName: z.string(),
    input: z.unknown(),
  }),
  z.object({
    type: z.literal("tool-result"),
    step: z.number().int(),
    toolCallId: z.string(),
    toolName: z.string(),
    outcome: toolOutcome,
  }),
  z.object({ type: z.literal("done"), stopReason: z.enum(["replied", "step-limit"]), steps: z.number().int(), reply: z.string() }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type TurnEvent = z.infer<typeof turnEventSchema>;

export const conversationRequestSchema = z.object({ replace: z.string().optional() });
export const conversationResponseSchema = z.object({ conversationId: z.string() });

export const messageRequestSchema = z.object({ conversationId: z.string(), text: z.string().trim().min(1).max(4000) });

export const shopRequestSchema = z.object({
  conversationId: z.string(),
  email: z.string().trim().max(200).optional(),
  orderId: z.number().int().positive().optional(),
});

const orderStatus = z.enum(["processing", "shipped", "delivered", "cancelled"]);

export const orderSnapshotSchema = z.object({
  id: z.number().int(),
  customerId: z.string(),
  status: orderStatus,
  placedAt: z.string(),
  deliveredAt: z.string().nullable(),
  total: z.number().int(),
  refunded: z.number().int(),
});
export type OrderSnapshot = z.infer<typeof orderSnapshotSchema>;

export const shopSnapshotSchema = z.object({
  customer: z
    .object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      orders: z.array(orderSnapshotSchema),
    })
    .nullable(),
  order: orderSnapshotSchema.nullable(),
});
export type ShopSnapshot = z.infer<typeof shopSnapshotSchema>;

// Every route answers a failure with this, in words the page can show as is.
export const apiErrorSchema = z.object({ error: z.string() });

const withOrderId = z.object({ order_id: z.number().int().positive() });

/**
 * The order the agent is working on: the order id in the most recent tool
 * call that names one, by its input or else its successful result. Calls that
 * name no single order (a customer lookup, a transfer) don't change it.
 */
export function focusedOrderId(
  calls: ReadonlyArray<{ input: unknown; outcome?: ToolOutcome }>,
): number | null {
  for (let i = calls.length - 1; i >= 0; i--) {
    const { input, outcome } = calls[i];
    const fromInput = withOrderId.safeParse(input);
    if (fromInput.success) return fromInput.data.order_id;
    if (outcome?.ok) {
      const fromResult = withOrderId.safeParse(outcome.value);
      if (fromResult.success) return fromResult.data.order_id;
    }
  }
  return null;
}
