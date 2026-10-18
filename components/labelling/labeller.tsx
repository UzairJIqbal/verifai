"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TranscriptRow } from "@/components/playground/transcript";
import { stepsToItems } from "@/components/runs/trajectory";
import { saveLabelResponseSchema, type Reveal, type SaveLabelRequest, type SaveLabelResponse } from "@/src/labels/protocol";
import { CLAIM_LABELS, type ClaimLabel, type JudgeCriterion, type Step } from "@/src/results/schema";

// The trial as the page offers it: never the judges' answers.
export type Offered = {
  runId: string;
  taskId: string;
  tryNumber: number;
  steps: Step[];
  criteria: { criterion: JudgeCriterion; name: string; asks: string; rubric: string }[];
  claims: { step: number; text: string }[];
};

// Colour only for pass and fail: supported reads as a pass, the other two as a fail.
const CLAIM_TONE: Record<ClaimLabel, string> = { supported: "border-pass text-pass", contradicted: "border-fail text-fail", unsupported: "border-fail text-fail" };

function Choice<T extends string>({ options, value, onChange, tone, disabled, label }: { options: readonly T[]; value: T | undefined; onChange: (v: T) => void; tone: (v: T) => string; disabled: boolean; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex gap-1">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          disabled={disabled}
          onClick={() => onChange(o)}
          className={cn(
            "rounded-sm border px-1.5 text-[11px] leading-5 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-default",
            value === o ? cn("font-medium", tone(o)) : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

const passFail = (v: "pass" | "fail") => (v === "pass" ? "border-pass text-pass" : "border-fail text-fail");
const word = (pass: boolean) => (pass ? "pass" : "fail");

function Agrees({ same }: { same: boolean }) {
  return <span className={cn("font-medium", same ? "text-pass" : "text-fail")}>{same ? "agrees" : "disagrees"}</span>;
}

export function Labeller({ offered }: { offered: Offered }) {
  const router = useRouter();
  const [criteria, setCriteria] = useState<Partial<Record<JudgeCriterion, "pass" | "fail">>>({});
  const [claims, setClaims] = useState<(ClaimLabel | undefined)[]>(() => offered.claims.map(() => undefined));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SaveLabelResponse | null>(null);

  const items = stepsToItems(offered.steps).filter((i) => i.kind !== "call");
  const claimsAt = new Map<string, number[]>();
  offered.claims.forEach((c, i) => claimsAt.set(String(c.step), [...(claimsAt.get(String(c.step)) ?? []), i]));
  const marked = offered.criteria.filter((c) => criteria[c.criterion] !== undefined).length + claims.filter((c) => c !== undefined).length;
  const total = offered.criteria.length + offered.claims.length;
  const locked = saving || saved !== null;
  const reveal = saved?.reveal ?? null;

  async function save() {
    const labelled = claims.filter((c): c is ClaimLabel => c !== undefined);
    if (labelled.length < claims.length) return;
    const body: SaveLabelRequest = {
      runId: offered.runId,
      taskId: offered.taskId,
      tryNumber: offered.tryNumber,
      criteria: offered.criteria.map((c) => ({ criterion: c.criterion, pass: criteria[c.criterion] === "pass" })),
      claims: labelled,
    };
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/labels", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = typeof json === "object" && json !== null && "error" in json && typeof json.error === "string" ? json.error : `The server answered ${response.status}.`;
        setError(message);
        return;
      }
      const parsed = saveLabelResponseSchema.safeParse(json);
      if (!parsed.success) {
        setError("The label was sent, but the answer from the server didn't make sense. Reload the page to see whether it was saved.");
        return;
      }
      setSaved(parsed.data);
    } catch {
      setError("Couldn't reach the server. Check `pnpm dev` is still running, then try again.");
    } finally {
      setSaving(false);
    }
  }

  const revealClaim = (i: number): Reveal["claims"][number] | undefined => reveal?.claims[i];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,56rem)_22rem] lg:items-start">
      <div>
        <p className="mb-1 text-[12px] text-muted-foreground">
          <span className="font-mono">{offered.runId}</span> / <span className="font-mono text-foreground">{offered.taskId}</span>, try {offered.tryNumber}
        </p>
        <ol className="divide-y rounded-md border px-3">
          {items.map((item) => (
            <TranscriptRow
              key={item.id}
              item={item}
              still
              marks={{
                at: Number(item.id),
                notes: (claimsAt.get(item.id) ?? []).length > 0 && (
                  <ul className="mt-1.5 space-y-1.5 border-t border-dashed pt-1.5">
                    {(claimsAt.get(item.id) ?? []).map((i) => {
                      const r = revealClaim(i);
                      return (
                        <li key={i} className="text-[12px]">
                          <p className="mb-0.5">
                            <span className="text-muted-foreground">claim:</span> {offered.claims[i].text}
                          </p>
                          <Choice
                            label={`Claim: ${offered.claims[i].text}`}
                            options={CLAIM_LABELS}
                            value={claims[i]}
                            disabled={locked}
                            tone={(v) => CLAIM_TONE[v]}
                            onChange={(v) => setClaims((cs) => cs.map((c, j) => (j === i ? v : c)))}
                          />
                          {r && (
                            <p className="mt-0.5 text-muted-foreground">
                              checker: <span className="text-foreground">{r.judge}</span> · <Agrees same={(r.judge === "supported") === (r.yours === "supported")} />
                              {r.judge !== r.yours && (r.judge === "supported") === (r.yours === "supported") && " (both not supported)"} · {r.reason}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ),
              }}
            />
          ))}
        </ol>
      </div>

      <aside className="space-y-3 lg:sticky lg:top-4">
        <section className="rounded-md border">
          <h2 className="border-b px-3 py-1.5 text-[12px] font-medium">Criteria</h2>
          <ul className="divide-y">
            {offered.criteria.map((c) => {
              const r = reveal?.criteria.find((v) => v.criterion === c.criterion);
              return (
                <li key={c.criterion} className="space-y-1 px-3 py-2 text-[12px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{c.name}</span>
                    <Choice
                      label={c.name}
                      options={["pass", "fail"] as const}
                      value={criteria[c.criterion]}
                      disabled={locked}
                      tone={passFail}
                      onChange={(v) => setCriteria((cs) => ({ ...cs, [c.criterion]: v }))}
                    />
                  </div>
                  <p className="text-muted-foreground">{c.asks}</p>
                  <details>
                    <summary className="cursor-pointer text-muted-foreground">The rubric&apos;s words</summary>
                    <p className="mt-1 whitespace-pre-wrap">{c.rubric}</p>
                  </details>
                  {r && (
                    <p className="text-muted-foreground">
                      judge: <span className="text-foreground">{word(r.judge)}</span> · <Agrees same={r.judge === r.yours} /> · {r.reason}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {offered.claims.length === 0 && <p className="text-[12px] text-muted-foreground">The claim checker found no claims in the replies.</p>}

        {saved === null ? (
          <div className="space-y-1.5">
            <Button size="sm" onClick={save} disabled={saving || marked < total}>
              {saving ? "Saving…" : "Save label"}
            </Button>
            <p className="text-[12px] text-muted-foreground">
              {marked} of {total} marked{marked < total && ": mark every criterion and claim to save"}.
            </p>
            {error && <p className="text-[12px] whitespace-pre-wrap text-fail">{error}</p>}
          </div>
        ) : (
          <div className="space-y-1.5 text-[12px]">
            <p>
              Saved to <span className="font-mono">{saved.split}</span>.
            </p>
            {saved.split === "judge-test" ? (
              <p className="text-muted-foreground">The judges&apos; answers stay hidden: judge-test labels only ever give the agreement numbers, so nothing is learned from them.</p>
            ) : (
              <p className="text-muted-foreground">The judges&apos; answers are shown above. Disagreements here are what a judge may be tuned on.</p>
            )}
            <Button size="sm" onClick={() => router.refresh()}>
              Next trial
            </Button>
          </div>
        )}
      </aside>
    </div>
  );
}
