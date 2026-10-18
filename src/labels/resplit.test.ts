import { describe, expect, it } from "vitest";
import { stratifiedSplit } from "./resplit";
import type { Label } from "./schema";

const label = (taskId: string, split: Label["split"], pass: boolean, claim: Label["claims"][number]["label"] = "supported"): Label => ({
  runId: "r",
  taskId,
  tryNumber: 1,
  split,
  source: "human",
  rubricVersion: "v",
  claimsPromptVersion: "v",
  labelledAt: "t",
  criteria: [{ criterion: "tone", pass }],
  claims: [{ step: 1, text: "x", label: claim }],
});

describe("stratifiedSplit", () => {
  it("puts failing tasks on both sides, moving as few as it can", () => {
    const labels = ["f1", "f2", "f3", "f4"].map((t) => label(t, "judge-dev", false)).concat(["p1", "p2", "p3"].map((t) => label(t, "judge-test", true)), [label("c1", "judge-dev", true, "unsupported")]);
    const { sides, record } = stratifiedSplit(labels, "now", "why");
    expect(["f1", "f2", "f3", "f4"].filter((t) => sides.get(t) === "judge-test")).toHaveLength(2);
    expect(record.strata).toEqual([
      { name: "a criterion fails", tasks: 4, test: 2, dev: 2 },
      { name: "only a claim fails", tasks: 1, test: 0, dev: 1 },
      { name: "everything passes", tasks: 3, test: 2, dev: 1 },
    ]);
    expect(record.seenInDev).toHaveLength(2);
    expect(record.seenInDev.every((t) => t.startsWith("f"))).toBe(true);
    expect(record.movedToDev).toHaveLength(1);
  });

  it("gives the same split every time", () => {
    const labels = ["a", "b", "c", "d"].map((t) => label(t, "judge-dev", false));
    expect([...stratifiedSplit(labels, "1", "r").sides]).toEqual([...stratifiedSplit(labels, "2", "r").sides]);
  });
});
