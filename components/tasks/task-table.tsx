"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { CATEGORIES, type Category } from "@/src/tasks/schema";

// One dev task, with its expectations already put into words on the server.
export type TaskRow = {
  id: string;
  category: Category;
  difficulty: "easy" | "hard";
  adversarial: boolean;
  note: string;
  firstMessage: string;
  cannedReplies: string[];
  changes: string[];
  facts: string[];
  refusal: boolean;
};

type Filter = Category | "all";

export function TaskTable({ rows, canOpenPlayground }: { rows: TaskRow[]; canOpenPlayground: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const shown = filter === "all" ? rows : rows.filter((r) => r.category === filter);
  const count = (f: Filter) => (f === "all" ? rows.length : rows.filter((r) => r.category === f).length);

  return (
    <div className="min-w-0">
      <div role="group" aria-label="Filter by category" className="mb-2 flex flex-wrap gap-1">
        {(["all", ...CATEGORIES] as const).map((f) => (
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
              <th className="px-3 py-1.5 font-normal">id</th>
              <th className="px-3 py-1.5 font-normal">category</th>
              <th className="px-3 py-1.5 font-normal">difficulty</th>
              <th className="px-3 py-1.5 font-normal">adversarial</th>
              <th className="px-3 py-1.5 font-normal">first message</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const isOpen = open === row.id;
              return (
                <Fragment key={row.id}>
                  <tr className={`border-b last:border-b-0 ${isOpen ? "bg-muted" : "hover:bg-muted/60"}`}>
                    <td className="px-3 py-1.5 align-top whitespace-nowrap">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setOpen(isOpen ? null : row.id)}
                        className="font-mono text-link hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {row.id}
                      </button>
                    </td>
                    <td className="px-3 py-1.5 align-top">{row.category}</td>
                    <td className="px-3 py-1.5 align-top">{row.difficulty}</td>
                    <td className="px-3 py-1.5 align-top">{row.adversarial ? "yes" : <span className="text-muted-foreground">no</span>}</td>
                    <td className="max-w-[48rem] min-w-64 px-3 py-1.5 align-top">{row.firstMessage}</td>
                  </tr>
                  {isOpen && <TaskDetail row={row} canOpenPlayground={canOpenPlayground} />}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TaskDetail({ row, canOpenPlayground }: { row: TaskRow; canOpenPlayground: boolean }) {
  return (
    <tr className="border-b bg-muted/40 last:border-b-0">
      <td colSpan={5} className="px-3 pt-2 pb-3">
        <p className="mb-2 text-muted-foreground">{row.note}</p>
        <dl className="grid max-w-[64rem] gap-x-6 gap-y-2 sm:grid-cols-[9rem_minmax(0,1fr)]">
          <dt className="text-muted-foreground">Canned replies</dt>
          <dd>
            {row.cannedReplies.length === 0 ? (
              <span className="text-muted-foreground">none: the agent should finish without asking</span>
            ) : (
              <ol className="list-decimal pl-4">
                {row.cannedReplies.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
            )}
          </dd>
          <dt className="text-muted-foreground">Expected changes</dt>
          <dd>
            {row.changes.length === 0 ? (
              <span className="text-muted-foreground">nothing in the shop may change</span>
            ) : (
              <ul className="font-mono">
                {row.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            )}
          </dd>
          {row.facts.length > 0 && (
            <>
              <dt className="text-muted-foreground">Reply must state</dt>
              <dd>{row.facts.join("; ")}</dd>
            </>
          )}
          {row.refusal && (
            <>
              <dt className="text-muted-foreground">Reply must</dt>
              <dd>refuse</dd>
            </>
          )}
        </dl>
        {canOpenPlayground && (
          <Link href={`/playground?task=${row.id}`} className="mt-3 inline-block text-link">
            Open in playground
          </Link>
        )}
      </td>
    </tr>
  );
}
