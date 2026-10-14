import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatRupees } from "@/src/shop/money";
import type { OrderSnapshot, ShopSnapshot } from "@/src/playground/protocol";

// What changed on an order since the panel last looked, so a cancel or a
// refund is visible as a change and not only as a new value.
export type OrderChanges = Record<number, { status?: string; refunded?: number }>;

export function diffSnapshots(before: ShopSnapshot | null, after: ShopSnapshot): OrderChanges {
  const seen = new Map<number, OrderSnapshot>();
  for (const o of [...(before?.customer?.orders ?? []), ...(before?.order ? [before.order] : [])]) seen.set(o.id, o);
  const changes: OrderChanges = {};
  for (const o of [...(after.customer?.orders ?? []), ...(after.order ? [after.order] : [])]) {
    const old = seen.get(o.id);
    if (!old) continue;
    const change: OrderChanges[number] = {};
    if (old.status !== o.status) change.status = old.status;
    if (old.refunded !== o.refunded) change.refunded = old.refunded;
    if (change.status !== undefined || change.refunded !== undefined) changes[o.id] = change;
  }
  return changes;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b px-3 py-2.5 last:border-b-0">
      <h2 className="mb-1.5 text-[11px] font-medium text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Was({ children }: { children: ReactNode }) {
  return <span className="ml-1.5 text-[11px] text-muted-foreground">was {children}</span>;
}

export function ShopPanel({
  email,
  focusOrderId,
  snapshot,
  changes,
  error,
}: {
  email: string;
  focusOrderId: number | null;
  snapshot: ShopSnapshot | null;
  changes: OrderChanges;
  error: string | null;
}) {
  const order = snapshot?.order ?? null;
  const change = order ? changes[order.id] : undefined;
  return (
    <aside className="rounded-md border bg-card" aria-label="This conversation's shop">
      {error && <p className="border-b px-3 py-2 text-fail">{error}</p>}

      <Section title="Order the agent is working on">
        {focusOrderId === null ? (
          <p className="text-muted-foreground">None yet. When the agent looks up an order, it shows here.</p>
        ) : order === null ? (
          <p className="text-muted-foreground">
            Order <code>{focusOrderId}</code> isn&apos;t in this shop.
          </p>
        ) : (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
            <dt className="text-muted-foreground">order</dt>
            <dd className="font-mono">{order.id}</dd>
            <dt className="text-muted-foreground">status</dt>
            <dd>
              <span className={cn(change?.status !== undefined && "font-semibold")}>{order.status}</span>
              {change?.status !== undefined && <Was>{change.status}</Was>}
            </dd>
            <dt className="text-muted-foreground">total</dt>
            <dd className="font-mono">{formatRupees(order.total)}</dd>
            <dt className="text-muted-foreground">refunded</dt>
            <dd>
              <span className={cn("font-mono", change?.refunded !== undefined && "font-semibold")}>
                {formatRupees(order.refunded)}
              </span>
              {change?.refunded !== undefined && <Was>{formatRupees(change.refunded)}</Was>}
            </dd>
            <dt className="text-muted-foreground">left</dt>
            <dd className="font-mono">{formatRupees(order.total - order.refunded)}</dd>
            <dt className="text-muted-foreground">placed</dt>
            <dd className="font-mono">{order.placedAt}</dd>
            {order.deliveredAt && (
              <>
                <dt className="text-muted-foreground">delivered</dt>
                <dd className="font-mono">{order.deliveredAt}</dd>
              </>
            )}
            <dt className="text-muted-foreground">customer</dt>
            <dd className="font-mono">{order.customerId}</dd>
          </dl>
        )}
      </Section>

      <Section title="Customer">
        {email.trim() === "" ? (
          <p className="text-muted-foreground">Pick a customer to see their orders.</p>
        ) : snapshot === null ? (
          <p className="text-muted-foreground">Reading the shop…</p>
        ) : snapshot.customer === null ? (
          <p className="text-muted-foreground">
            No customer has the email <code className="wrap-anywhere">{email.trim()}</code> in this shop.
          </p>
        ) : (
          <>
            <p>
              {snapshot.customer.name} <code className="text-muted-foreground">{snapshot.customer.id}</code>
            </p>
            <table className="mt-1.5 w-full">
              <thead className="sr-only">
                <tr>
                  <th>Order</th>
                  <th>Status</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.customer.orders.map((o) => (
                  <tr key={o.id} className={cn(o.id === focusOrderId && "bg-secondary")}>
                    <td className="py-px pl-1 font-mono">{o.id}</td>
                    <td className="px-2 py-px">
                      <span className={cn(changes[o.id]?.status !== undefined && "font-semibold")}>{o.status}</span>
                    </td>
                    <td className="py-px pr-1 text-right font-mono">{formatRupees(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Section>
    </aside>
  );
}
