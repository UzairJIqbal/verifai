import { afterAll, describe, expect, it } from "vitest";
import { CANCEL_REFERENCE, taskWith, testShop } from "./fixtures";
import { GRADERS, gradeTry, outcomePassed } from "./index";
import { scripted } from "./script";
import { passes, ungraded } from "./steps";

const { seedPath, shop, dispose } = testShop("index");
afterAll(dispose);

describe("grading a try", () => {
  it("returns one verdict per grader, in the reported order", () => {
    const t = scripted(seedPath, [{ customer: "Cancel 1005 please." }, { call: "cancel_order", input: { order_id: 1005 } }]);
    expect(gradeTry(taskWith(CANCEL_REFERENCE), t, shop).map((v) => v.grader)).toEqual([...GRADERS]);
  });
  it("lets only the outcome decide success", () => {
    const outcome = [passes("state", "ok"), passes("reply", "ok")];
    const trajectoryFailures = GRADERS.slice(2).map((g) => ({ ...passes(g, "x"), pass: false }));
    expect(outcomePassed([...outcome, ...trajectoryFailures])).toBe(true);
    expect(outcomePassed([passes("state", "ok"), ungraded("reply", "no reply")])).toBe(false);
    expect(outcomePassed([passes("state", "ok")])).toBe(false);
  });
});
