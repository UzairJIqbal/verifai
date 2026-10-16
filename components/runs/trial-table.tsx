"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { TRIAL_STATUSES, type TrialStatus } from "@/src/results/schema";
import { formatMs } from "@/components/playground/transcript";
import { formatCount, STATUS_CLASS } from "./format";

// One try as the table shows it. Holdout rows carry the outcome alone.
export type TrialRow = {
  taskId: string;
  tryNumber: number;
  category: string;
  difficulty: string;
  status: TrialStatus;
  // Why it didn't pass, in the grader's or the error's own words.
  why: string | null;
  detail: { calls: number; replayed: number; tokens: number; modelMs: number; end: string | null } | null;
};

type Filter = TrialStatus | "all";

export function TrialTable({ runId, rows: allRows, sealed }: { runId: string; rows: TrialRow[]; sealed: boolean }) {
  // A category or difficulty comes from the link that was followed to get
  // here (a number in the report), so it lives in the address.
  const params = useSearchParams();
  const pathname = usePathname();
  const category = params.get("category");
  const difficulty = params.get("difficulty");
  // Following a new number shows all its tries, not just the outcome that
  // happened to be picked for the last one.
  const [picked, setPicked] = useState<{ for: string; filter: Filter }>({ for: "", filter: "all" });
  const scopeKey = `${category}|${difficulty}`;
  const filter = picked.for === scopeKey ? picked.filter : "all";
  const setFilter = (f: Filter) => setPicked({ for: scopeKey, filter: f });
  const rows = allRows.filter((r) => (category === null || r.category === category) && (difficulty === null || r.difficulty === difficulty));
  const shown = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const count = (f: Filter) => (f === "all" ? rows.length : rows.filter((r) => r.status === f).length);
  const cell = "px-3 py-1.5 align-top";
  const scope = [category && `${category} tasks`, difficulty && `${difficulty} tasks`].filter(Boolean).join(", ");

  return (
    <div id="trials" className="min-w-0 scroll-mt-4">
      {scope !== "" && (
        <p className="mb-2 text-[12px]">
          Showing the {rows.length} tries of {scope} only.{" "}
          <Link href={`${pathname}#trials`} className="text-link hover:underline">
            Show all {allRows.length}
          </Link>
        </p>
      )}
      <div role="group" aria-label="Filter by outcome" className="mb-2 flex flex-wrap gap-1">
        {(["all", ...TRIAL_STATUSES] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className="h-7 rounded border px-2.5 text-[12px] text-muted-foreground hover:bg-accent aria-pressed:border-foreground/40 aria-pressed:bg-accent aria-pressed:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {f} <span className="font-mono">{count(f)}</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-left text-[12px]">
          <thead className="border-b text-muted-foreground">
            <tr>
              <th className={`${cell} font-normal`}>task</th>
              <th className={`${cell} font-normal`}>try</th>
              <th className={`${cell} font-normal`}>category</th>
              <th className={`${cell} font-normal`}>difficulty</th>
              <th className={`${cell} font-normal`}>outcome</th>
              {!sealed && (
                <>
                  <th className={`${cell} font-normal`}>ended</th>
                  <th className={`${cell} text-right font-normal`}>calls</th>
                  <th className={`${cell} text-right font-normal`}>tokens</th>
                  <th className={`${cell} text-right font-normal`}>model time</th>
                  <th className={`${cell} font-normal`}>why it didn&apos;t pass</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={sealed ? 5 : 10} className={`${cell} text-muted-foreground`}>
                  No {filter === "all" ? "" : `${filter} `}tries {scope === "" ? "in this run" : `among ${scope}`}.
                </td>
              </tr>
            )}
            {shown.map((row) => (
              <tr key={`${row.taskId}#${row.tryNumber}`} className="border-b last:border-b-0 hover:bg-muted/60">
                <td className={`${cell} font-mono whitespace-nowrap`}>
                  {sealed ? (
                    row.taskId
                  ) : (
                    <Link
                      href={`/runs/${runId}/${row.taskId}/${row.tryNumber}`}
                      className="text-link hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {row.taskId}
                    </Link>
                  )}
                </td>
                <td className={`${cell} font-mono`}>{row.tryNumber}</td>
                <td className={cell}>{row.category}</td>
                <td className={cell}>{row.difficulty}</td>
                <td className={`${cell} ${STATUS_CLASS[row.status]}`}>{row.status}</td>
                {row.detail && (
                  <>
                    <td className={`${cell} whitespace-nowrap text-muted-foreground`}>{row.detail.end ?? "–"}</td>
                    <td className={`${cell} text-right font-mono whitespace-nowrap`}>
                      {row.detail.calls}
                      {row.detail.replayed > 0 && <span className="text-muted-foreground"> ({row.detail.replayed} replayed)</span>}
                    </td>
                    <td className={`${cell} text-right font-mono`}>{formatCount(row.detail.tokens)}</td>
                    <td className={`${cell} text-right font-mono whitespace-nowrap`}>{formatMs(row.detail.modelMs)}</td>
                    <td className={`${cell} max-w-[40rem] min-w-64 text-muted-foreground`}>{row.why ?? ""}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
