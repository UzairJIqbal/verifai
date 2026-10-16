import { OUTCOME_GRADERS } from "@/src/graders";
import type { TrialVerdict } from "@/src/results/schema";

const isOutcome = (grader: string) => OUTCOME_GRADERS.some((g) => g === grader);

function Mark({ v }: { v: TrialVerdict }) {
  if (v.ungraded) return <span className="text-fail">? couldn&apos;t grade</span>;
  return <span className={v.pass ? "text-pass" : "text-fail"}>{v.pass ? "✓ pass" : "✗ fail"}</span>;
}

// Under the step a verdict points at: which grader, and its reason.
export function VerdictNote({ v }: { v: TrialVerdict }) {
  return (
    <p className="mt-1 text-[12px]">
      <span className="font-mono">{v.grader}</span> <Mark v={v} /> <span className="text-muted-foreground">{v.reason}</span>
    </p>
  );
}

// Every grader on one try, at the top of its trajectory: the two that decide
// the outcome first, then the rest. A verdict about a step links to it.
export function VerdictSummary({ verdicts, errored }: { verdicts: TrialVerdict[]; errored: boolean }) {
  if (verdicts.length === 0) {
    return (
      <p className="mb-4 text-[12px] text-muted-foreground">
        {errored ? "No grades: the try errored before it finished, so there was nothing to grade." : "No grades were recorded for this try. Run `pnpm regrade` to grade it."}
      </p>
    );
  }
  const failed = verdicts.filter((v) => !v.pass && !v.ungraded).length;
  const ungraded = verdicts.filter((v) => v.ungraded).length;
  const cell = "px-3 py-1 align-top";
  const row = (v: TrialVerdict) => (
    <tr key={v.grader} className={`border-b last:border-b-0 ${v.pass ? "" : "bg-fail/5"}`}>
      <td className={`${cell} font-mono whitespace-nowrap`}>{v.grader}</td>
      <td className={`${cell} whitespace-nowrap`}>
        <Mark v={v} />
      </td>
      <td className={`${cell} font-mono whitespace-nowrap`}>
        {v.step === null ? (
          <span className="text-muted-foreground">whole try</span>
        ) : (
          <a href={`#at-${v.step}`} className="text-link hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            #{v.step}
          </a>
        )}
      </td>
      <td className={`${cell} text-muted-foreground`}>{v.reason}</td>
    </tr>
  );
  return (
    <section className="mb-4 max-w-[64rem]" aria-label="Grades">
      <p className="mb-1.5 text-[12px]">
        <span className="font-mono">{verdicts.length - failed - ungraded}</span> of {verdicts.length} graders passed
        {failed > 0 && (
          <>
            , <span className="font-mono text-fail">{failed}</span> failed
          </>
        )}
        {ungraded > 0 && (
          <>
            , <span className="font-mono text-fail">{ungraded}</span> couldn&apos;t grade
          </>
        )}
        <span className="text-muted-foreground">. Only state and reply decide the outcome; failing steps are marked red below.</span>
      </p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-[12px]">
          <tbody>
            {verdicts.filter((v) => isOutcome(v.grader)).map(row)}
            <tr className="border-b bg-muted/40">
              <td colSpan={4} className={`${cell} text-[11px] text-muted-foreground`}>
                reported beside the outcome
              </td>
            </tr>
            {verdicts.filter((v) => !isOutcome(v.grader)).map(row)}
          </tbody>
        </table>
      </div>
    </section>
  );
}
