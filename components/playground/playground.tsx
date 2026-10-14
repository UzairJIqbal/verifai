"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { readApiError, readJsonLines } from "./ndjson";
import { ShopPanel, diffSnapshots, type OrderChanges } from "./shop-panel";
import { TranscriptRow, WaitingRow, type TranscriptItem } from "./transcript";
import {
  apiErrorSchema,
  conversationResponseSchema,
  focusedOrderId,
  shopSnapshotSchema,
  turnEventSchema,
  type ShopSnapshot,
  type TurnEvent,
} from "@/src/playground/protocol";
import type { PickableCustomer } from "@/src/playground/snapshot";

export type PlaygroundMeta = {
  providerLabel: string;
  model: string;
  promptVersion: string;
  toolDescriptionsVersion: string;
  maxSteps: number;
  today: string;
};

type Start = { state: "starting" } | { state: "ready"; id: string } | { state: "failed"; error: string };

const UNREACHABLE = "Couldn't reach the dev server. Check that `pnpm dev` is still running, then try again.";
const RETRY = "Your message wasn't answered. Send it again to retry.";

// The email goes into the message itself, the way a customer would write it,
// so nothing reaches the agent that the transcript doesn't show.
const EMAIL_PREFIX = /^Hi, my email is \S*\. /;
const emailPrefix = (email: string) => `Hi, my email is ${email}. `;

async function postJson(url: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
}

let nextId = 0;
const newId = () => `item-${++nextId}`;

export function Playground({ meta, customers }: { meta: PlaygroundMeta; customers: PickableCustomer[] }) {
  const [start, setStart] = useState<Start>({ state: "starting" });
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [waitingStep, setWaitingStep] = useState<number | null>(null);
  const [replySteps, setReplySteps] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [email, setEmail] = useState("");
  const [composer, setComposer] = useState("");
  // An order carried over from the previous conversation, so New conversation
  // keeps showing it (back at its seeded state) until the agent picks another.
  const [carriedOrderId, setCarriedOrderId] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<ShopSnapshot | null>(null);
  const [changes, setChanges] = useState<OrderChanges>({});
  const [panelError, setPanelError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [debouncedEmail, setDebouncedEmail] = useState("");

  const conversationId = start.state === "ready" ? start.id : null;
  const snapshotRef = useRef<ShopSnapshot | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const toolCalls = useMemo(
    () => items.flatMap((item) => (item.kind === "tool" ? [{ input: item.input, outcome: item.outcome }] : [])),
    [items],
  );
  const focusOrderId = focusedOrderId(toolCalls) ?? carriedOrderId;

  const openConversation = useCallback(async (replace?: string) => {
    setStart({ state: "starting" });
    try {
      const response = await postJson("/api/playground/conversation", replace ? { replace } : {});
      if (!response.ok) {
        setStart({ state: "failed", error: await readApiError(response, apiErrorSchema) });
        return;
      }
      const parsed = conversationResponseSchema.safeParse(await response.json());
      setStart(parsed.success ? { state: "ready", id: parsed.data.conversationId } : { state: "failed", error: "The server sent back something unexpected. Reload the page." });
    } catch {
      setStart({ state: "failed", error: UNREACHABLE });
    }
  }, []);

  useEffect(() => {
    // Starting the first conversation is a request to the server, which is
    // exactly what effects are for; the state it sets arrives later.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void openConversation();
  }, [openConversation]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedEmail(email.trim()), 300);
    return () => clearTimeout(timer);
  }, [email]);

  // The side panel reads this conversation's own shop after every tool result.
  useEffect(() => {
    if (conversationId === null) return;
    if (debouncedEmail === "" && focusOrderId === null) {
      snapshotRef.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSnapshot(null);
      return;
    }
    const controller = new AbortController();
    (async () => {
      try {
        const response = await postJson(
          "/api/playground/shop",
          { conversationId, email: debouncedEmail || undefined, orderId: focusOrderId ?? undefined },
          controller.signal,
        );
        if (!response.ok) {
          setPanelError(await readApiError(response, apiErrorSchema));
          return;
        }
        const parsed = shopSnapshotSchema.safeParse(await response.json());
        if (!parsed.success) {
          setPanelError("The shop sent back something unexpected. Reload the page.");
          return;
        }
        setChanges((old) => ({ ...old, ...diffSnapshots(snapshotRef.current, parsed.data) }));
        snapshotRef.current = parsed.data;
        setSnapshot(parsed.data);
        setPanelError(null);
      } catch {
        if (!controller.signal.aborted) setPanelError(UNREACHABLE);
      }
    })();
    return () => controller.abort();
  }, [conversationId, debouncedEmail, focusOrderId, refreshTick]);

  // Follow new steps only if the reader is already at the bottom.
  useLayoutEffect(() => {
    const log = logRef.current;
    if (log && stickToBottom.current) log.scrollTop = log.scrollHeight;
  }, [items, waitingStep]);

  const add = (item: TranscriptItem) => setItems((old) => [...old, item]);

  const handleEvent = (event: TurnEvent) => {
    switch (event.type) {
      case "waiting":
        setWaitingStep(event.step);
        setReplySteps(event.step);
        setTotalSteps((n) => n + 1);
        return;
      case "text":
        setWaitingStep(null);
        add({ kind: "agent", id: newId(), step: event.step, text: event.text });
        return;
      case "tool-call":
        setWaitingStep(null);
        add({ kind: "tool", id: event.toolCallId, step: event.step, toolName: event.toolName, input: event.input });
        return;
      case "tool-result":
        setItems((old) =>
          old.map((item) => (item.kind === "tool" && item.id === event.toolCallId ? { ...item, outcome: event.outcome } : item)),
        );
        setRefreshTick((n) => n + 1);
        return;
      case "done":
        setWaitingStep(null);
        if (event.stopReason === "step-limit") {
          add({ kind: "notice", id: newId(), tone: "info", text: `Stopped after ${event.steps} steps without a reply (the step limit).` });
        } else if (event.reply.trim() === "") {
          add({ kind: "notice", id: newId(), tone: "info", text: "The agent finished without writing a reply." });
        }
        return;
      case "error":
        setWaitingStep(null);
        add({ kind: "notice", id: newId(), tone: "error", text: `${event.message}\n${RETRY}` });
        return;
    }
  };

  const send = async () => {
    const text = composer.trim();
    if (conversationId === null || busy || text === "") return;
    setBusy(true);
    setReplySteps(0);
    setComposer("");
    stickToBottom.current = true;
    add({ kind: "user", id: newId(), text });
    try {
      const response = await postJson("/api/playground/message", { conversationId, text });
      if (!response.ok || response.body === null) {
        add({ kind: "notice", id: newId(), tone: "error", text: `${await readApiError(response, apiErrorSchema)}\n${RETRY}` });
        return;
      }
      let ended = false;
      let badLines = 0;
      await readJsonLines(
        response.body,
        turnEventSchema,
        (event) => {
          if (event.type === "done" || event.type === "error") ended = true;
          handleEvent(event);
        },
        () => badLines++,
      );
      if (badLines > 0) {
        add({ kind: "notice", id: newId(), tone: "error", text: `${badLines} step(s) arrived in a shape the page couldn't read and aren't shown.` });
      }
      if (!ended) {
        add({ kind: "notice", id: newId(), tone: "error", text: `The reply stopped part way. Check the terminal running \`pnpm dev\`.\n${RETRY}` });
      }
    } catch {
      add({ kind: "notice", id: newId(), tone: "error", text: `${UNREACHABLE}\n${RETRY}` });
    } finally {
      setWaitingStep(null);
      setBusy(false);
      setRefreshTick((n) => n + 1);
    }
  };

  const newConversation = () => {
    if (busy) return;
    setCarriedOrderId(focusOrderId);
    setItems([]);
    setReplySteps(0);
    setTotalSteps(0);
    setChanges({});
    snapshotRef.current = null;
    setSnapshot(null);
    void openConversation(conversationId ?? undefined);
  };

  const pickEmail = (value: string) => {
    setEmail(value);
    const known = customers.some((c) => c.email === value.trim());
    if (!known) return;
    setComposer((old) => {
      if (old === "") return emailPrefix(value.trim());
      if (EMAIL_PREFIX.test(old)) return old.replace(EMAIL_PREFIX, emailPrefix(value.trim()));
      return old;
    });
  };

  const onComposerKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  };

  const suggestion = customers[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px]">
        <h1 className="text-sm font-semibold">Playground</h1>
        <Meta label="model">{meta.model}</Meta>
        <Meta label="prompt">{meta.promptVersion}</Meta>
        <Meta label="tools">{meta.toolDescriptionsVersion}</Meta>
        <Meta label="shop today">{meta.today}</Meta>
        <Meta label="step">
          {busy ? `${replySteps}/${meta.maxSteps}` : `–/${meta.maxSteps}`}
          <span className="ml-2 font-sans text-muted-foreground">{totalSteps} this conversation</span>
        </Meta>
        <Button size="sm" variant="outline" className="ml-auto h-7" onClick={newConversation} disabled={busy || start.state === "starting"}>
          New conversation
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="order-2 flex min-h-[28rem] min-w-0 flex-col rounded-md border lg:order-1 lg:h-[calc(100dvh-9.5rem)]">
          <label className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-3 py-2">
            <span className="text-[12px] text-muted-foreground">Customer email</span>
            <input
              type="email"
              list="playground-customers"
              value={email}
              onChange={(e) => pickEmail(e.target.value)}
              placeholder="pick one or type any"
              className="h-7 min-w-0 flex-1 rounded border bg-background px-2 font-mono text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <datalist id="playground-customers">
              {customers.map((c) => (
                <option key={c.email} value={c.email}>
                  {c.name}, order {c.processingOrderId} processing
                </option>
              ))}
            </datalist>
          </label>

          <div
            ref={logRef}
            className="min-h-0 flex-1 overflow-y-auto px-3"
            onScroll={(e) => {
              const el = e.currentTarget;
              stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            }}
          >
            {start.state === "starting" ? (
              <p className="py-3 text-muted-foreground">Opening a fresh copy of the shop…</p>
            ) : start.state === "failed" ? (
              <div className="py-3">
                <p className="text-fail">{start.error}</p>
                <Button size="sm" variant="outline" className="mt-2 h-7" onClick={() => void openConversation()}>
                  Try again
                </Button>
              </div>
            ) : items.length === 0 ? (
              <div className="max-w-prose py-3 text-muted-foreground">
                <p>A fresh copy of the shop is ready. Nothing you do here touches the seed.</p>
                {suggestion && (
                  <p className="mt-1">
                    Try picking <code>{suggestion.email}</code> and asking to cancel order{" "}
                    <code>{suggestion.processingOrderId}</code>, which is still processing.
                  </p>
                )}
              </div>
            ) : (
              <ol className="divide-y">
                {items.map((item) => (
                  <TranscriptRow key={item.id} item={item} />
                ))}
                {waitingStep !== null && <WaitingRow step={waitingStep} providerLabel={meta.providerLabel} />}
              </ol>
            )}
          </div>

          <form
            className="flex items-end gap-2 border-t p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <textarea
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              onKeyDown={onComposerKey}
              rows={2}
              maxLength={4000}
              disabled={conversationId === null}
              placeholder={busy ? "The agent is working…" : "Write as the customer. Enter sends, Shift+Enter adds a line."}
              aria-label="Message to the agent"
              className="min-h-14 min-w-0 flex-1 resize-y rounded border bg-background px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            />
            <Button type="submit" size="sm" className="h-8" disabled={busy || conversationId === null || composer.trim() === ""}>
              {busy ? "Working…" : "Send"}
            </Button>
          </form>
        </div>

        <div className="order-1 min-w-0 lg:order-2">
          <ShopPanel email={email} focusOrderId={focusOrderId} snapshot={snapshot} changes={changes} error={panelError} />
        </div>
      </div>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{children}</span>
    </span>
  );
}
