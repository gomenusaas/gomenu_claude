"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { cancelMyOrder, startPayment } from "@/app/actions/order";
import { fmt } from "@/lib/i18n/text";
import { money } from "@/lib/site/money";
import type { SiteStrings } from "@/lib/site/strings";
import type { I18n } from "@/lib/site/types";
import { createClient } from "@/lib/supabase/browser";

/** Shape of track_order(): no phone numbers or staff details. */
export interface TrackedOrder {
  number: number;
  restaurant_name: string;
  branch_name: string;
  service_type: "table" | "car" | "pickup";
  table_label: string | null;
  car_plate: string | null;
  status: string;
  payment_status: string;
  payment_timing: "before" | "after";
  needs_confirmation: boolean;
  confirmed: boolean;
  currency: string;
  subtotal_minor: number;
  vat_minor: number;
  vat_rate_bp: number;
  prices_include_vat: boolean;
  total_minor: number;
  refunded_minor: number;
  rejected_reason: string | null;
  default_locale: string;
  can_pay: boolean;
  can_cancel: boolean;
  items: { name: I18n; variant_name: I18n | null; options: { name: I18n }[]; quantity: number; line_total_minor: number; notes: string | null }[];
}

const FLOW = ["placed", "waiting", "confirmed", "preparing", "ready", "served", "completed"] as const;
const RANK: Record<string, number> = { new: 1, confirmed: 2, preparing: 3, ready: 4, served: 5, completed: 6 };

/**
 * spec §10 diner tracking: Placed → Waiting for confirmation (if enabled) → Confirmed → Preparing
 * → Ready → Served → Completed. Live over the order's own public channel (its unguessable key),
 * which carries only the status; the page then re-reads through track_order.
 */
export function OrderTracker({ publicKey, order, locale, s, menuHref, signedIn }: {
  publicKey: string; order: TrackedOrder; locale: string; s: SiteStrings; menuHref: string; signedIn: boolean;
}) {
  const t = s.order;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const tx = (v: I18n | null | undefined) => (v ? v[locale] || v[order.default_locale] || Object.values(v)[0] || "" : "");
  const m = (minor: number) => money(minor, order.currency, locale);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`order:${publicKey}`)
      .on("broadcast", { event: "status" }, () => router.refresh())
      .subscribe();
    const poll = setInterval(() => router.refresh(), 20_000);  // in case the live channel drops
    return () => {
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [publicKey, router]);

  const closed = ["rejected", "cancelled", "refunded"].includes(order.status);
  const steps = FLOW.filter((step) => step !== "waiting" || order.needs_confirmation);
  const rank = RANK[order.status] ?? 0;
  const reached = (step: (typeof FLOW)[number]) =>
    step === "placed" ? true : step === "waiting" ? rank >= 1 : rank >= RANK[step];

  const pay = () => start(async () => {
    setError(null);
    const result = await startPayment(publicKey);
    if ("url" in result) window.location.assign(result.url);
    else setError(t.errors[result.code] ?? t.errors.generic);
  });
  const cancel = () => {
    if (!window.confirm(t.cancelConfirm)) return;
    start(async () => {
      const result = await cancelMyOrder(publicKey);
      if (!result.ok) setError(t.errors[result.code ?? "generic"] ?? t.errors.generic);
      router.refresh();
    });
  };

  return (
    <div className="mx-auto grid max-w-xl gap-5 px-4 py-6" data-testid="order-tracker" data-status={order.status}
         data-payment-status={order.payment_status}>
      <div>
        <p className="text-sm opacity-75">{order.restaurant_name} · {order.branch_name}</p>
        <h1 className="text-2xl font-bold">{fmt(t.order, { n: order.number })}</h1>
        <p className="text-sm opacity-75">
          {order.service_type === "table" ? fmt(s.table, { label: order.table_label ?? "" })
            : order.service_type === "car" ? `${t.serviceCar} · ${order.car_plate}` : t.servicePickup}
        </p>
      </div>

      {closed ? (
        <p role="status" className="gm-card p-4 font-semibold" data-testid="order-closed">
          {order.status === "rejected" ? t.rejected : order.status === "cancelled" ? t.cancelled : t.refunded}
        </p>
      ) : (
        <ol className="grid gap-2" aria-label={t.status}>
          {steps.map((step) => (
            <li key={step} className={`flex items-center gap-3 ${reached(step) ? "" : "opacity-40"}`}
                data-testid="order-step" data-reached={reached(step)}>
              <span aria-hidden className={`grid size-6 place-items-center rounded-full text-xs ${reached(step) ? "bg-[var(--gm-accent,#16a34a)] text-white" : "border"}`}>
                {reached(step) ? "✓" : ""}
              </span>
              <span>{t.steps[step]}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs opacity-60">{t.live}</p>

      <ul className="gm-card grid gap-2 p-4">
        {order.items.map((i, n) => (
          <li key={n} className="flex justify-between gap-3">
            <span>
              {i.quantity} × {tx(i.name)}{i.variant_name ? ` · ${tx(i.variant_name)}` : ""}
              {i.options.length ? <span className="block text-sm opacity-75">{i.options.map((o) => tx(o.name)).join(", ")}</span> : null}
            </span>
            <span className="shrink-0">{m(i.line_total_minor)}</span>
          </li>
        ))}
        <li className="flex justify-between border-t pt-2 font-bold"><span>{t.total}</span><span data-testid="order-total">{m(order.total_minor)}</span></li>
        {order.vat_rate_bp > 0 ? (
          <li className="text-sm opacity-75">
            {fmt(order.prices_include_vat ? t.vatIncluded : t.vatAdded, { rate: order.vat_rate_bp / 100 })}: {m(order.vat_minor)}
          </li>
        ) : null}
      </ul>

      <section className="grid gap-2">
        <p><span className="font-semibold">{t.payment}:</span>{" "}
          <span data-testid="payment-status">{t.paymentStatus[order.payment_status] ?? order.payment_status}</span></p>
        {order.can_pay ? (
          <button type="button" className="gm-go w-full justify-center" disabled={pending} onClick={pay} data-testid="pay-now">{t.payNow}</button>
        ) : !closed && order.payment_status !== "paid" && order.needs_confirmation && !order.confirmed ? (
          <p className="text-sm opacity-75">{t.payWaitConfirm}</p>
        ) : !closed && order.payment_status !== "paid" ? (
          <p className="text-sm opacity-75">{t.payAtRestaurant}</p>
        ) : null}
        {order.can_cancel ? (
          <button type="button" className="text-sm underline" disabled={pending} onClick={cancel} data-testid="cancel-order">{t.cancel}</button>
        ) : null}
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href={menuHref} className="gm-chip">{t.backToMenu}</Link>
        {signedIn ? <Link href="/me" className="gm-chip">{t.myOrders}</Link> : <p className="text-sm opacity-75">{t.signInToSave}</p>}
      </div>
    </div>
  );
}
