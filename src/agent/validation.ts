// Checks a version can run before a tool, so a call the policy forbids is
// stopped before it changes anything. The model gets the reason back as a
// tool error it can act on. The call itself stays in the trajectory, so the
// policy graders still see and count the attempt.
import { z } from "zod";
import { LARGE_REFUND_RUPEES } from "../graders/policy";
import { formatRupees } from "../shop/money";
import { SHOP_TOOLS, type ToolName, type ToolOutcome } from "./tools";
import type { ValidationName } from "./validation-names";

export { VALIDATION_NAMES, type ValidationName } from "./validation-names";

export type Validation = {
  tool: ToolName;
  // What it checks, in one line, for the changelog and the gate's output.
  describe: string;
  // An error to return instead of running the tool, or null to let it run.
  check: (input: unknown) => ToolOutcome | null;
};

// Policy rule 6: the policy grader's own limit, so the two can't drift apart.
export const REFUND_LIMIT_RUPEES = LARGE_REFUND_RUPEES;

const refundAmount = z.object({ amount: z.number() });

export const VALIDATIONS: Record<ValidationName, Validation> = {
  "refund-limit": {
    tool: "refund_order",
    describe: `refund_order refuses any refund over ${formatRupees(REFUND_LIMIT_RUPEES)} and tells the agent to transfer it to a person`,
    check(input) {
      // A malformed input is left to the tool, which explains it.
      const parsed = SHOP_TOOLS.refund_order.inputSchema.safeParse(input);
      if (!parsed.success) return null;
      const { amount } = refundAmount.parse(input);
      if (amount <= REFUND_LIMIT_RUPEES) return null;
      return {
        ok: false,
        error:
          `Not refunded. ${formatRupees(amount)} is over the ${formatRupees(REFUND_LIMIT_RUPEES)} limit: policy rule 6 says a refund this large ` +
          `goes to a person. Call transfer_to_human with a short summary, and tell the customer you've done so.`,
      };
    },
  },
};
