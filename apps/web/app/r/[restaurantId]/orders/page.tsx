import { Badge, Card, CardContent } from "@gomenu/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { setShift } from "@/app/actions/orders";
import { Elapsed, KitchenSound, LiveOrders } from "@/components/live-orders";
import { OrderActions } from "@/components/orders/order-actions";
import { RowAction } from "@/components/row-action";
import { requireUser } from "@/lib/auth/context";
import { formatMoney } from "@/lib/format";
import { fmt, getDictionary } from "@/lib/i18n";
import { CLOSED_STATUSES, OPEN_STATUSES, ORDER_COLUMNS, type OrderRow, orderContext, serviceLabel } from "@/lib/orders/data";

export const metadata = { title: "Orders" };

/** spec §10: the order board for waiters and managers. Branch scope comes from RLS. */
export default async function OrdersBoard({ params, searchParams }: {
  params: Promise<{ restaurantId: string }>; searchParams: Promise<{ branch?: string }>;
}) {
  const { restaurantId } = await params;
  const { branch } = await searchParams;
  const ctx = await requireUser();
  if (!ctx.active_memberships?.some((m) => m.restaurant_id === restaurantId)) notFound();
  const { locale, t } = await getDictionary();
  const oc = await orderContext(restaurantId, ctx.user_id!);
  if (!oc.can("orders.view")) notFound();
  const branchId = oc.myBranches.some((b) => b.id === branch) ? branch : undefined;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  let open = oc.supabase.from("orders").select(ORDER_COLUMNS).eq("restaurant_id", restaurantId).in("status", OPEN_STATUSES)
    .order("created_at").limit(200);
  let closed = oc.supabase.from("orders").select(ORDER_COLUMNS).eq("restaurant_id", restaurantId).in("status", CLOSED_STATUSES)
    .gte("created_at", startOfDay.toISOString()).order("created_at", { ascending: false }).limit(50);
  if (branchId) {
    open = open.eq("branch_id", branchId);
    closed = closed.eq("branch_id", branchId);
  }
  const [{ data: openRows }, { data: closedRows }] = await Promise.all([open, closed]);
  const orders = (openRows ?? []) as unknown as OrderRow[];
  const done = (closedRows ?? []) as unknown as OrderRow[];
  const waiting = orders.filter((o) => o.status === "new");
  const active = orders.filter((o) => o.status !== "new");
  const mode = oc.settings?.assignment_mode ?? "open";
  const branchName = (id: string) => oc.myBranches.find((b) => b.id === id)?.name ?? "";
  const money = (o: OrderRow) => formatMoney(o.total_minor, o.currency, locale);
  const topics = (branchId ? [branchId] : oc.myBranches.map((b) => b.id)).map((b) => `restaurant:${restaurantId}:branch:${b}`);
  const canShift = oc.can("orders.confirm_table") || oc.can("orders.manage");

  const card = (o: OrderRow) => (
    <li key={o.id}>
      <Card data-testid="order-card" data-order-number={o.number} data-status={o.status}>
        <CardContent className="grid gap-2 pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Link href={`/r/${restaurantId}/orders/${o.id}`} className="text-lg font-semibold hover:underline">
              {fmt(t.orders.number, { n: o.number })} · {serviceLabel(t, o, oc.tables)}
            </Link>
            <span className="text-sm text-muted-foreground"><Elapsed since={o.created_at} format={t.orders.minutesAgo} /></span>
          </div>
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <Badge data-testid="order-status">{t.orders.status[o.status]}</Badge>
            <Badge>{t.orders.payment[o.payment_status]}</Badge>
            <Badge>{t.orders.source[o.source]}</Badge>
            {oc.myBranches.length > 1 ? <Badge>{branchName(o.branch_id)}</Badge> : null}
            {o.is_test ? <Badge>{t.orders.test}</Badge> : null}
            {o.kitchen_alert ? <Badge className="bg-warning text-warning-foreground">{t.orders.kitchenAlert}</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {[
              o.assigned_waiter_id
                ? fmt(t.orders.assignedTo, { name: o.assigned_waiter_id === ctx.user_id ? t.orders.you : oc.names.get(o.assigned_waiter_id) ?? "—" })
                : o.service_type === "table" && o.status === "new" ? t.orders.unassigned : null,
              o.customer_name, money(o),
            ].filter(Boolean).join(" · ")}
          </p>
          <OrderActions order={o} restaurantId={restaurantId} userId={ctx.user_id!} can={oc.can} mode={mode}
                        staff={oc.staffByBranch.get(o.branch_id) ?? []} onShift={oc.onShift.has(o.branch_id)} t={t} />
        </CardContent>
      </Card>
    </li>
  );

  return (
    <div className="grid gap-6">
      <LiveOrders topics={topics} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.orders.title}</h1>
          <p className="text-muted-foreground">{t.orders.body}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {/* Sound for new orders waiting for a waiter and for my orders that turn Ready. */}
        <KitchenSound labels={{ on: t.kitchen.soundOn, off: t.kitchen.soundOff }}
                      ticketKeys={[...waiting.map((o) => o.id), ...active.filter((o) => o.status === "ready" && o.assigned_waiter_id === ctx.user_id).map((o) => `${o.id}:ready`)]} />
        {oc.can("orders.create_waiter") ? (
          <Link href={`/r/${restaurantId}/orders/new${branchId ? `?branch=${branchId}` : ""}`} data-testid="new-waiter-order"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            {t.orders.newOrder}
          </Link>
        ) : null}
        </div>
      </div>

      {oc.myBranches.length > 1 ? (
        <nav aria-label={t.orders.branch} className="flex flex-wrap gap-1 text-sm">
          <Link href={`/r/${restaurantId}/orders`} className={`rounded-md border px-3 py-1 ${!branchId ? "bg-muted font-medium" : ""}`}>{t.orders.allBranches}</Link>
          {oc.myBranches.map((b) => (
            <Link key={b.id} href={`/r/${restaurantId}/orders?branch=${b.id}`}
                  className={`rounded-md border px-3 py-1 ${branchId === b.id ? "bg-muted font-medium" : ""}`}>{b.name}</Link>
          ))}
        </nav>
      ) : null}

      {canShift ? (
        <section aria-label={t.orders.shift} className="flex flex-wrap gap-2" data-testid="shifts">
          {oc.myBranches.filter((b) => !branchId || b.id === branchId).map((b) => {
            const on = oc.onShift.has(b.id);
            return (
              <div key={b.id} className="flex items-center gap-2 rounded-md border px-3 py-1 text-sm">
                <span>{fmt(on ? t.orders.onShift : t.orders.offShift, { branch: b.name })}</span>
                <RowAction action={setShift} fields={{ restaurant_id: restaurantId, branch_id: b.id, on: String(!on) }}
                           label={on ? t.orders.endShift : t.orders.startShift} variant={on ? "ghost" : "outline"} testId="shift-toggle" />
              </div>
            );
          })}
        </section>
      ) : null}

      <section className="grid gap-3" aria-labelledby="h-waiting">
        <h2 id="h-waiting" className="font-semibold">{t.orders.needsAction} ({waiting.length})</h2>
        {waiting.length ? <ul className="grid gap-3 md:grid-cols-2">{waiting.map(card)}</ul> : <p className="text-sm text-muted-foreground">{t.orders.none}</p>}
      </section>
      <section className="grid gap-3" aria-labelledby="h-active">
        <h2 id="h-active" className="font-semibold">{t.orders.active} ({active.length})</h2>
        {active.length ? <ul className="grid gap-3 md:grid-cols-2">{active.map(card)}</ul> : <p className="text-sm text-muted-foreground">{t.orders.none}</p>}
      </section>
      <section className="grid gap-3" aria-labelledby="h-closed">
        <h2 id="h-closed" className="font-semibold">{t.orders.closedToday} ({done.length})</h2>
        {done.length ? (
          <ul className="grid gap-1 text-sm">
            {done.map((o) => (
              <li key={o.id} className="flex flex-wrap justify-between gap-2 border-b py-1" data-testid="closed-order">
                <Link href={`/r/${restaurantId}/orders/${o.id}`} className="hover:underline">
                  {fmt(t.orders.number, { n: o.number })} · {serviceLabel(t, o, oc.tables)}
                </Link>
                <span>{t.orders.status[o.status]} · {money(o)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">{t.orders.none}</p>}
      </section>
    </div>
  );
}
