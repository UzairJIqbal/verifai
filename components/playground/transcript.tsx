import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ToolOutcome } from "@/src/playground/protocol";

export type TranscriptItem =
  | { kind: "user"; id: string; text: string }
  | { kind: "agent"; id: string; step: number; text: string }
  | { kind: "tool"; id: string; step: number; toolName: string; input: unknown; outcome?: ToolOutcome }
  | { kind: "notice"; id: string; tone: "error" | "info"; text: string };

// One row of the log: who, at which step, and what.
function Row({ who, step, children, className }: { who: string; step?: number; children: ReactNode; className?: string }) {
  return (
    <li className={cn("step-in grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 py-2", className)}>
      <div className="pt-px text-right text-[11px] leading-5 text-muted-foreground">
        <div>{who}</div>
        {step !== undefined && <div className="font-mono">step {step}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </li>
  );
}

// Objects show one key per line, values as compact JSON, so an order reads
// as a short table instead of one long line.
function JsonFields({ value }: { value: unknown }) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return <code className="block wrap-anywhere">{JSON.stringify(value)}</code>;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) return <code className="text-muted-foreground">{"{}"}</code>;
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 font-mono text-[12px] leading-[18px]">
      {entries.map(([key, v]) => (
        <div key={key} className="contents">
          <dt className="text-muted-foreground">{key}</dt>
          <dd className="wrap-anywhere">{JSON.stringify(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ToolCard({ item }: { item: Extract<TranscriptItem, { kind: "tool" }> }) {
  const { outcome } = item;
  return (
    <div className="rounded-md border bg-card">
      <div className="flex items-center gap-2 border-b px-2.5 py-1">
        <code className="font-medium">{item.toolName}</code>
        <span className="ml-auto text-[11px]">
          {outcome === undefined ? (
            <span className="text-muted-foreground">running…</span>
          ) : outcome.ok ? (
            <span className="text-pass">✓ ok</span>
          ) : (
            <span className="text-fail">✗ error</span>
          )}
        </span>
      </div>
      <div className="grid gap-1.5 px-2.5 py-1.5 sm:grid-cols-[3.5rem_minmax(0,1fr)] sm:gap-x-2">
        <div className="text-[11px] leading-[18px] text-muted-foreground">input</div>
        <JsonFields value={item.input} />
        {outcome !== undefined && (
          <>
            <div className="text-[11px] leading-[18px] text-muted-foreground">result</div>
            {outcome.ok ? (
              <JsonFields value={outcome.value} />
            ) : (
              <p className="font-mono text-[12px] leading-[18px] text-fail wrap-anywhere">{outcome.error}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function TranscriptRow({ item }: { item: TranscriptItem }) {
  switch (item.kind) {
    case "user":
      return (
        <Row who="you">
          <p className="whitespace-pre-wrap wrap-anywhere">{item.text}</p>
        </Row>
      );
    case "agent":
      return (
        <Row who="agent" step={item.step}>
          <p className="whitespace-pre-wrap wrap-anywhere">{item.text}</p>
        </Row>
      );
    case "tool":
      return (
        <Row who="tool" step={item.step}>
          <ToolCard item={item} />
        </Row>
      );
    case "notice":
      return (
        <Row who="">
          <p className={cn("whitespace-pre-wrap wrap-anywhere", item.tone === "error" ? "text-fail" : "text-muted-foreground")}>
            {item.text}
          </p>
        </Row>
      );
  }
}

export function WaitingRow({ step, providerLabel }: { step: number; providerLabel: string }) {
  return (
    <Row who="agent" step={step}>
      <p className="text-muted-foreground">Waiting for {providerLabel}…</p>
    </Row>
  );
}
