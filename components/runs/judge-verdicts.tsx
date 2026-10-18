import type { ReactNode } from "react";
import type { JudgeCheck } from "@/src/results/schema";
import { JUDGE_CRITERION_TEXT } from "@/src/results/judge-text";

/**
 * The AI judge's verdicts on one try, in their own section under the
 * graders: they never change its outcome. Says why when there are none.
 */
export function JudgeVerdicts({ judge, runId, errored, hasReply }: { judge: JudgeCheck | null; runId: string; errored: boolean; hasReply: boolean }) {
  const heading = (
    <h2 id="judge-verdicts-heading" className="mb-0.5 text-[13px] font-medium">
      AI judge
    </h2>
  );
  const note = (text: ReactNode) => (
    <section className="mb-4 max-w-[64rem]" aria-labelledby="judge-verdicts-heading">
      {heading}
      <p className="text-[12px] text-muted-foreground">{text}</p>
    </section>
  );
  if (errored) return note("Not judged: the try errored before it finished.");
  if (!hasReply) return note("Not judged: the agent wrote no reply, so there was nothing to read.");
  if (judge === null) {
    return note(
      <>
        Not judged yet. Run <span className="font-mono">pnpm judge {runId}</span> (about one judge call per try with a reply).
      </>,
    );
  }
  const by = (
    <>
      judged by <span className="font-mono">{judge.model}</span>, rubric <span className="font-mono">{judge.rubricVersion}</span>
    </>
  );
  if (judge.status === "ungraded") {
    return note(
      <>
        <span className="text-fail">? couldn&apos;t grade</span> {judge.reason} · {by}
      </>,
    );
  }
  const cell = "px-3 py-1 align-top";
  const failed = judge.verdicts.filter((v) => !v.pass).length;
  return (
    <section className="mb-4 max-w-[64rem]" aria-labelledby="judge-verdicts-heading">
      {heading}
      <p className="mb-1.5 text-[12px]">
        <span className="font-mono">{judge.verdicts.length - failed}</span> of {judge.verdicts.length} criteria passed
        {failed > 0 && (
          <>
            , <span className="font-mono text-fail">{failed}</span> failed
          </>
        )}
        <span className="text-muted-foreground">
          {" "}
          · {by}. The judge reads how the replies sound; it never decides the outcome. Refusal explained is asked only when the agent refused.
        </span>
      </p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-[12px]">
          <tbody>
            {judge.verdicts.map((v) => (
              <tr key={v.criterion} className={`border-b last:border-b-0 ${v.pass ? "" : "bg-fail/5"}`}>
                <td className={`${cell} whitespace-nowrap`}>{JUDGE_CRITERION_TEXT[v.criterion].name}</td>
                <td className={`${cell} whitespace-nowrap`}>
                  <span className={v.pass ? "text-pass" : "text-fail"}>{v.pass ? "✓ pass" : "✗ fail"}</span>
                </td>
                <td className={`${cell} text-muted-foreground`}>{v.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
