import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ToolOutcome } from "@/src/playground/protocol";

export type TranscriptItem =
  // `who` defaults to "you"; a recorded try calls it "customer".
  | { kind: "user"; id: string; text: string; who?: string }
  | { kind: "agent"; id: string; step: number; text: string }
  | { kind: "tool"; id: string; step: number; toolName: string; input: unknown; outcome?: ToolOutcome; latencyMs?: number }
  | { kind: "notice"; id: string; tone: "error" | "info"; text: string }
  // One model call of a recorded try: what it cost and how long it took.
  | {
      kind: "call";
      id: string;
      step: number;
      // The pool provider that answered.
      provider: string;
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      latencyMs: number;
      replayed: boolean;
    };

const n = (value: number) => value.toLocaleString("en-US");
export const formatMs = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

// One row of the log: who, at which step, and what. A live chat slides each
// row in as it arrives; a recorded try is still, since nothing new arrives.
// A recorded try's row can carry what the graders said about it: `at` is its
// place in the try (#N, as grader reasons cite it), `failing` marks it red.
// `highlight` is the values in it a check flagged (a fabricated order number,
// say): marked wherever they appear in the reply or the tool's input.
export type RowMarks = { at?: number; failing?: boolean; notes?: ReactNode; highlight?: string[] };

// The text with every flagged value marked, longest first so "Rs 1,200"
// wins over "1,200".
function Highlighted({ text, values }: { text: string; values?: string[] }) {
  const wanted = [...new Set(values ?? [])].filter((v) => v.length > 0).sort((a, b) => b.length - a.length);
  if (wanted.length === 0) return <>{text}</>;
  const pattern = new RegExp(`(${wanted.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return (
    <>
      {text.split(pattern).map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-sm bg-fail/15 px-0.5 text-fail" title="Never seen before it was written">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

function Row({
  who,
  step,
  children,
  className,
  still = false,
  marks,
}: {
  who: string;
  step?: number;
  children: ReactNode;
  className?: string;
  still?: boolean;
  marks?: RowMarks;
}) {
  return (
    <li
      id={marks?.at !== undefined ? `at-${marks.at}` : undefined}
      className={cn(
        "grid scroll-mt-4 grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 py-2",
        !still && "step-in",
        marks?.failing && "-mx-3 border-l-2 border-l-fail bg-fail/5 pr-3 pl-[10px]",
        className,
      )}
    >
      <div className="pt-px text-right text-[11px] leading-5 text-muted-foreground">
        <div>{who}</div>
        {step !== undefined && <div className="font-mono">step {step}</div>}
        {marks?.at !== undefined && <div className="font-mono">#{marks.at}</div>}
      </div>
      <div className="min-w-0">
        {children}
        {marks?.notes}
      </div>
    </li>
  );
}

// Objects show one key per line, values as compact JSON, so an order reads
// as a short table instead of one long line.
function JsonFields({ value, highlight }: { value: unknown; highlight?: string[] }) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return (
      <code className="block wrap-anywhere">
        <Highlighted text={JSON.stringify(value)} values={highlight} />
      </code>
    );
  }
  const entries = Object.entries(value);
  if (entries.length === 0) return <code className="text-muted-foreground">{"{}"}</code>;
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 font-mono text-[12px] leading-[18px]">
      {entries.map(([key, v]) => (
        <div key={key} className="contents">
          <dt className="text-muted-foreground">{key}</dt>
          <dd className="wrap-anywhere">
            <Highlighted text={JSON.stringify(v)} values={highlight} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ToolCard({ item, highlight }: { item: Extract<TranscriptItem, { kind: "tool" }>; highlight?: string[] }) {
  const { outcome } = item;
  return (
    <div className="rounded-md border bg-card">
      <div className="flex items-center gap-2 border-b px-2.5 py-1">
        <code className="font-medium">{item.toolName}</code>
        {item.latencyMs !== undefined && <span className="font-mono text-[11px] text-muted-foreground">{formatMs(item.latencyMs)}</span>}
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
        <JsonFields value={item.input} highlight={highlight} />
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

export function TranscriptRow({ item, still = false, marks }: { item: TranscriptItem; still?: boolean; marks?: RowMarks }) {
  switch (item.kind) {
    case "user":
      return (
        <Row who={item.who ?? "you"} still={still} marks={marks}>
          <p className="whitespace-pre-wrap wrap-anywhere">{item.text}</p>
        </Row>
      );
    case "agent":
      return (
        <Row who="agent" step={item.step} still={still} marks={marks}>
          <p className="whitespace-pre-wrap wrap-anywhere">
            <Highlighted text={item.text} values={marks?.highlight} />
          </p>
        </Row>
      );
    case "tool":
      return (
        <Row who="tool" step={item.step} still={still} marks={marks}>
          <ToolCard item={item} highlight={marks?.highlight} />
        </Row>
      );
    case "call":
      return (
        <Row who="model" step={item.step} still={still} marks={marks} className="py-1">
          <p className="font-mono text-[11px] leading-5 text-muted-foreground">
            {item.provider} · {n(item.inputTokens)} in{item.cachedInputTokens > 0 && ` (${n(item.cachedInputTokens)} cached)`} · {n(item.outputTokens)} out ·{" "}
            {formatMs(item.latencyMs)}
            {item.replayed && " · replayed from the cache; tokens and time are the original call's"}
          </p>
        </Row>
      );
    case "notice":
      return (
        <Row who="" still={still} marks={marks}>
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
