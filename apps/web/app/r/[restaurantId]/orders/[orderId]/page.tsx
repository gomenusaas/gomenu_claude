import { Badge, Card, CardContent, CardHeader, CardTitle, Field, Input } from "@gomenu/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { refundPayment } from "@/app/actions/orders";
import { ActionForm } from "@/components/action-form";
import { LiveOrders } from "@/components/live-orders";
import { OrderActions } from "@/components/orders/order-actions";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth/context";
import { formatMoney } from "@/lib/format";
import { fmt, getDictionary } from "@/lib/i18n";
import { tx } from "@/lib/i18n/text";
import { ORDER_COLUMNS, type OrderRow, orderContext, serviceLabel } from "@/lib/orders/data";

export const metadata = { title: "Order" };

const EXP: Record<string, number> = { OMR: 3, BHD: 3, KWD: 3 };

type Item = { id: string; name: Record<string, string>; variant_name: Record<string, string> | null; options: { name: Record<string, string> }[];
  quantity: number; line_total_minor: number; notes: string | null };
type Event = { id: number; type: string; actor_name: string | null; data: Record<string, unknown>; created_at: string };
type Payment = { id: string; method: string; status: string; amount_minor: number; refunded_minor: number; currency: string;
  reference: string | null; provider_reference: string | null; created_at: string };
type Refund = { id: string; payment_id: string; amount_minor: number; reason: string; status: string; created_at: string };

export default async function OrderDetail({ params }: { params: Promise<{ restaurantId: string; orderId: string }> }) {
  const { restaurantId, orderId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(orderId)) notFound();
  const ctx = await requireUser();
  if (!ctx.active_memberships?.some((m) => m.restaurant_id === restaurantId)) notFound();
  const { locale, t } = await getDictionary();
  const oc = await orderContext(restaurantId, ctx.user_id!);
  const { data: row } = await oc.supabase.from("orders").select(ORDER_COLUMNS).eq("id", orderId).eq("restaurant_id", restaurantId).maybeSingle();
  if (!row) notFound();
  const o = row as unknown as OrderRow;
  const [{ data: items }, { data: events }, { data: payments }, { data: refunds }] = await Promise.all([
    oc.supabase.from("order_items").select("id, name, variant_name, options, quantity, line_total_minor, notes").eq("order_id", o.id).order("sort"),
    oc.supabase.from("order_events").select("id, type, actor_name, data, created_at").eq("order_id", o.id).order("id"),
    oc.supabase.from("payments").select("id, method, status, amount_minor, refunded_minor, currency, reference, provider_reference, created_at")
      .eq("order_id", o.id).order("created_at"),
    oc.supabase.from("payment_refunds").select("id, payment_id, amount_minor, reason, status, created_at").eq("order_id", o.id).order("created_at"),
  ]);
  const m = (minor: number) => formatMoney(minor, o.currency, locale);
  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale === "ar" ? "ar-OM" : "en-GB", { hour: "2-digit", minute: "2-digit" });
  const editable = ["new", "confirmed", "preparing", "ready"].includes(o.status) && ["unpaid", "failed"].includes(o.payment_status)
    && (oc.can("orders.manage") || ((o.assigned_waiter_id === ctx.user_id || o.created_by === ctx.user_id) && oc.can("orders.create_waiter")));
  const exp = EXP[o.currency] ?? 2;

  return (
    <div className="grid gap-6">
      <LiveOrders topics={[`restaurant:${restaurantId}:branch:${o.branch_id}`]} />
      <div className="grid gap-2">
        <Link href={`/r/${restaurantId}/orders`} className="text-sm underline">{t.orders.back}</Link>
        <h1 className="text-2xl font-semibold" data-testid="order-title">{fmt(t.orders.number, { n: o.number })} · {serviceLabel(t, o, oc.tables)}</h1>
        <div className="flex flex-wrap gap-1 text-xs">
          <Badge data-testid="order-status">{t.orders.status[o.status]}</Badge>
          <Badge data-testid="order-payment-status">{t.orders.payment[o.payment_status]}</Badge>
          <Badge>{t.orders.source[o.source]}</Badge>
          <Badge>{t.orders.timing[o.payment_timing]}</Badge>
          {o.is_test ? <Badge>{t.orders.test}</Badge> : null}
          {o.kitchen_alert ? <Badge className="bg-warning text-warning-foreground">{t.orders.kitchenAlert}</Badge> : null}
        </div>
        <OrderActions order={o} restaurantId={restaurantId} userId={ctx.user_id!} can={oc.can} mode={oc.settings?.assignment_mode ?? "open"}
                      staff={oc.staffByBranch.get(o.branch_id) ?? []} onShift={oc.onShift.has(o.branch_id)} t={t} full />
        {editable ? <div><Link href={`/r/${restaurantId}/orders/${o.id}/edit`} className="text-sm underline" data-testid="order-edit">{t.orders.edit}</Link></div> : null}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle as="h2" className="text-base">{t.orders.items}</CardTitle></CardHeader>
          <CardContent>
            <ul className="grid gap-2" data-testid="order-items">
              {((items ?? []) as unknown as Item[]).map((i) => (
                <li key={i.id} className="flex justify-between gap-3">
                  <span>
                    {i.quantity} × {tx(i.name, locale)}{i.variant_name ? ` · ${tx(i.variant_name, locale)}` : ""}
                    {i.options.length ? <span className="block text-sm text-muted-foreground">{i.options.map((x) => tx(x.name, locale)).join(", ")}</span> : null}
                    {i.notes ? <span className="block text-sm italic text-muted-foreground">{i.notes}</span> : null}
                  </span>
                  <span className="shrink-0">{m(i.line_total_minor)}</span>
                </li>
              ))}
              {!o.prices_include_vat && o.vat_rate_bp > 0 ? (
                <>
                  <li className="flex justify-between border-t pt-2"><span>{t.orders.subtotal}</span><span>{m(o.subtotal_minor)}</span></li>
                  <li className="flex justify-between"><span>{fmt(t.orders.vat, { rate: o.vat_rate_bp / 100 })}</span><span>{m(o.vat_minor)}</span></li>
                </>
              ) : null}
              <li className="flex justify-between border-t pt-2 font-semibold"><span>{t.orders.total}</span><span data-testid="order-total">{m(o.total_minor)}</span></li>
              {o.prices_include_vat && o.vat_rate_bp > 0 ? (
                <li className="text-sm text-muted-foreground">{fmt(t.orders.vatIncluded, { rate: o.vat_rate_bp / 100 })}: {m(o.vat_minor)}</li>
              ) : null}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle as="h2" className="text-base">{t.orders.customer}</CardTitle></CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {o.customer_name ? <p>{o.customer_name}</p> : null}
            {o.customer_phone ? <p dir="ltr" className="text-start">{o.customer_phone}</p> : null}
            {o.car_description ? <p>{o.car_description}</p> : null}
            {o.notes ? <p><span className="font-medium">{t.orders.notes}:</span> {o.notes}</p> : null}
            {o.closed_note ? <p><span className="font-medium">{t.orders.note}:</span> {o.closed_note}</p> : null}
            {o.assigned_waiter_id ? <p>{fmt(t.orders.assignedTo, { name: oc.names.get(o.assigned_waiter_id) ?? "—" })}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle as="h2" className="text-base">{t.orders.payments}</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            {(payments ?? []).length ? (
              <ul className="grid gap-3" data-testid="order-payments">
                {((payments ?? []) as Payment[]).map((p) => (
                  <li key={p.id} className="grid gap-2 rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span>{t.orders.method[p.method]} · {t.orders.paymentState[p.status]}</span>
                      <span className="font-medium">{m(p.amount_minor)}</span>
                    </div>
                    {p.reference || p.provider_reference ? <p className="text-xs text-muted-foreground" dir="ltr">{p.reference ?? p.provider_reference}</p> : null}
                    {p.refunded_minor ? <p className="text-xs">{fmt(t.orders.refunded, { amount: m(p.refunded_minor) })}</p> : null}
                    {((refunds ?? []) as Refund[]).filter((r) => r.payment_id === p.id && r.status === "pending").map((r) => (
                      <p key={r.id} className="text-xs text-muted-foreground">{fmt(t.orders.refundPending, { amount: m(r.amount_minor) })}</p>
                    ))}
                    {oc.can("payments.manage") && p.status === "succeeded" && p.refunded_minor < p.amount_minor ? (
                      <ActionForm action={refundPayment} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="restaurant_id" value={restaurantId} />
                        <input type="hidden" name="payment_id" value={p.id} />
                        <input type="hidden" name="exp" value={exp} />
                        <Field id={`amount-${p.id}`} label={t.orders.refundAmount}>
                          <Input name="amount" inputMode="decimal" className="w-28" defaultValue={((p.amount_minor - p.refunded_minor) / 10 ** exp).toFixed(exp)} />
                        </Field>
                        <Field id={`reason-${p.id}`} label={t.orders.refundReason}><Input name="reason" className="w-48" /></Field>
                        <SubmitButton size="sm" variant="outline" data-testid="refund-submit">{t.orders.refund}</SubmitButton>
                      </ActionForm>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">{t.orders.noPayments}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle as="h2" className="text-base">{t.orders.timeline}</CardTitle></CardHeader>
          <CardContent>
            <ol className="grid gap-1 text-sm" data-testid="order-timeline">
              {((events ?? []) as unknown as Event[]).map((e) => (
                <li key={e.id} className="flex gap-3" data-event={e.type}>
                  <span className="w-12 shrink-0 tabular-nums text-muted-foreground">{time(e.created_at)}</span>
                  <span>{t.orders.events[e.type] ?? e.type}{e.actor_name ? ` · ${e.actor_name}` : ""}
                    {e.type === "rejected" && typeof e.data.reason === "string" ? ` · ${t.orders.reasons[e.data.reason] ?? ""}` : ""}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
