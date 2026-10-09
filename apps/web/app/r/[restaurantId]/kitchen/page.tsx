import Link from "next/link";
import { notFound } from "next/navigation";
import { acknowledgeKitchenAlert, kitchenUpdate } from "@/app/actions/orders";
import { Elapsed, KitchenSound, LiveOrders } from "@/components/live-orders";
import { RowAction } from "@/components/row-action";
import { requireUser } from "@/lib/auth/context";
import { fmt, getDictionary } from "@/lib/i18n";
import { tx } from "@/lib/i18n/text";
import { serviceLabel } from "@/lib/orders/data";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Kitchen" };

type Ticket = {
  id: string; number: number; branch_id: string; service_type: "table" | "car" | "pickup"; table_id: string | null;
  car_plate: string | null; status: "confirmed" | "preparing" | "ready"; kitchen_released_at: string; kitchen_alert: boolean;
  notes: string | null;
};
type Line = { order_id: string; name: Record<string, string>; variant_name: Record<string, string> | null;
  options: { name: Record<string, string> }[]; quantity: number; notes: string | null };

/**
 * spec §10 kitchen display: tablet-first, oldest first, timers, delay warnings, audible alerts.
 * Only orders released to the kitchen exist here (RLS): confirmed and paid, or paying after.
 */
export default async function KitchenDisplay({ params, searchParams }: {
  params: Promise<{ restaurantId: string }>; searchParams: Promise<{ branch?: string }>;
}) {
  const { restaurantId } = await params;
  const { branch } = await searchParams;
  const ctx = await requireUser();
  if (!ctx.active_memberships?.some((m) => m.restaurant_id === restaurantId)) notFound();
  const { locale, t } = await getDictionary();
  const supabase = await createClient();
  const [{ data: perms }, { data: branches }, { data: settings }, { data: tables }] = await Promise.all([
    supabase.rpc("my_permissions", { p_restaurant_id: restaurantId }),
    supabase.from("branches").select("id, name").eq("restaurant_id", restaurantId).is("archived_at", null).order("sort"),
    supabase.from("ordering_settings").select("kitchen_delay_minutes").eq("restaurant_id", restaurantId).single(),
    supabase.from("restaurant_tables").select("id, label").eq("restaurant_id", restaurantId),
  ]);
  if (!(perms ?? []).includes("kitchen.access")) notFound();
  let query = supabase.from("orders")
    .select("id, number, branch_id, service_type, table_id, car_plate, status, kitchen_released_at, kitchen_alert, notes")
    .eq("restaurant_id", restaurantId).in("status", ["confirmed", "preparing", "ready"]).not("kitchen_released_at", "is", null)
    .order("kitchen_released_at").limit(100);
  if (branch) query = query.eq("branch_id", branch);
  const { data: rows } = await query;
  const tickets = (rows ?? []) as Ticket[];
  const { data: lineRows } = tickets.length
    ? await supabase.from("order_items").select("order_id, name, variant_name, options, quantity, notes").in("order_id", tickets.map((x) => x.id)).order("sort")
    : { data: [] };
  const lines = (lineRows ?? []) as unknown as Line[];
  const delay = settings?.kitchen_delay_minutes ?? 15;
  const visibleBranches = (branches ?? []).filter((b) => !branch || b.id === branch);
  const base = { restaurant_id: restaurantId };

  const column = (status: Ticket["status"]) => {
    const list = tickets.filter((x) => x.status === status);
    return (
      <section key={status} aria-labelledby={`k-${status}`} className="grid content-start gap-3">
        <h2 id={`k-${status}`} className="text-lg font-semibold">{t.kitchen.columns[status]} ({list.length})</h2>
        {list.map((k) => (
          <article key={k.id} data-testid="kitchen-ticket" data-status={k.status}
                   className={`grid gap-2 rounded-lg border-2 bg-card p-3 ${k.kitchen_alert ? "border-warning" : "border-border"}`}>
            <header className="flex items-baseline justify-between gap-2">
              <span className="text-xl font-bold">{fmt(t.orders.number, { n: k.number })}</span>
              <Elapsed since={k.kitchen_released_at} lateAfter={status === "ready" ? undefined : delay} lateLabel={t.kitchen.late} format={t.orders.minutesAgo} />
            </header>
            <p className="font-medium">{serviceLabel(t, k, tables ?? [])}</p>
            {k.kitchen_alert ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-warning px-2 py-1 text-sm text-warning-foreground" data-testid="kitchen-alert">
                <span>{t.kitchen.changed}</span>
                <RowAction action={acknowledgeKitchenAlert} fields={{ ...base, id: k.id }} label={t.kitchen.seen} />
              </div>
            ) : null}
            <ul className="grid gap-1 text-lg">
              {lines.filter((l) => l.order_id === k.id).map((l, n) => (
                <li key={n}>
                  <span className="font-bold">{l.quantity}×</span> {tx(l.name, locale)}{l.variant_name ? ` · ${tx(l.variant_name, locale)}` : ""}
                  {l.options.length ? <span className="block text-base text-muted-foreground">+ {l.options.map((o) => tx(o.name, locale)).join(", ")}</span> : null}
                  {l.notes ? <span className="block text-base italic">“{l.notes}”</span> : null}
                </li>
              ))}
            </ul>
            {k.notes ? <p className="text-sm italic">{k.notes}</p> : null}
            {status === "confirmed" ? (
              <RowAction action={kitchenUpdate} fields={{ ...base, id: k.id, status: "preparing" }} label={t.kitchen.start} variant="primary" testId="kitchen-start" />
            ) : status === "preparing" ? (
              <RowAction action={kitchenUpdate} fields={{ ...base, id: k.id, status: "ready" }} label={t.kitchen.ready} variant="primary" testId="kitchen-ready" />
            ) : null}
          </article>
        ))}
      </section>
    );
  };

  return (
    <div className="grid gap-4">
      <LiveOrders topics={visibleBranches.map((b) => `restaurant:${restaurantId}:branch:${b.id}`)} pollSeconds={20} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t.kitchen.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {(branches ?? []).length > 1 ? (
            <nav aria-label={t.kitchen.branch} className="flex flex-wrap gap-1 text-sm">
              <Link href={`/r/${restaurantId}/kitchen`} className={`rounded-md border px-3 py-2 ${!branch ? "bg-muted" : ""}`}>{t.orders.allBranches}</Link>
              {(branches ?? []).map((b) => (
                <Link key={b.id} href={`/r/${restaurantId}/kitchen?branch=${b.id}`} className={`rounded-md border px-3 py-2 ${branch === b.id ? "bg-muted" : ""}`}>{b.name}</Link>
              ))}
            </nav>
          ) : null}
          <KitchenSound ticketKeys={tickets.filter((x) => x.status === "confirmed" || x.kitchen_alert).map((x) => `${x.id}:${x.kitchen_alert}`)}
                        labels={{ on: t.kitchen.soundOn, off: t.kitchen.soundOff }} />
        </div>
      </div>
      {tickets.length ? (
        <div className="grid gap-4 md:grid-cols-3">{(["confirmed", "preparing", "ready"] as const).map(column)}</div>
      ) : <p className="py-10 text-center text-muted-foreground" data-testid="kitchen-empty">{t.kitchen.empty}</p>}
    </div>
  );
}
