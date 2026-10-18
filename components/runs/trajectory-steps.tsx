import { TranscriptRow } from "@/components/playground/transcript";
import { ClaimNote } from "@/components/runs/claims";
import { stepsToItems, verdictsByItem } from "@/components/runs/trajectory";
import { VerdictNote } from "@/components/runs/verdicts";
import type { Claim, Trial } from "@/src/results/schema";

// A try's steps with each verdict and claim under the step it points at, and
// the values a fabrication check flagged highlighted. The trajectory page and
// the review queue show the same thing.
export function TrajectorySteps({ trial }: { trial: Trial }) {
  const items = stepsToItems(trial.steps);
  if (items.length === 0) return <p className="text-muted-foreground">No steps were recorded: the try failed before its first model call.</p>;
  const byItem = verdictsByItem(items, trial.verdicts);
  // Fabricated values by the step they were written in; a tool call's step is its row.
  const spansAt = new Map<string, string[]>();
  for (const v of trial.verdicts) for (const s of v.spans) spansAt.set(String(s.step), [...(spansAt.get(String(s.step)) ?? []), s.text]);
  const claimsAt = new Map<string, Claim[]>();
  if (trial.claims?.status === "checked") for (const c of trial.claims.claims) claimsAt.set(String(c.step), [...(claimsAt.get(String(c.step)) ?? []), c]);

  return (
    <ol className="max-w-[56rem] divide-y rounded-md border px-3">
      {items.map((item) => (
        <TranscriptRow
          key={item.id}
          item={item}
          still
          marks={{
            at: Number(item.id),
            failing: (byItem.get(item.id) ?? []).some((v) => !v.pass),
            highlight: spansAt.get(item.id),
            notes: (
              <>
                {(byItem.get(item.id) ?? []).map((v) => (
                  <VerdictNote key={v.grader} v={v} />
                ))}
                {(claimsAt.get(item.id) ?? []).map((c, i) => (
                  <ClaimNote key={i} c={c} />
                ))}
              </>
            ),
          }}
        />
      ))}
    </ol>
  );
}
