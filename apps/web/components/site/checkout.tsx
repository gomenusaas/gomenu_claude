"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { placeOrder } from "@/app/actions/order";
import { fmt } from "@/lib/i18n/text";
import { money } from "@/lib/site/money";
import type { SiteStrings } from "@/lib/site/strings";
import type { I18n } from "@/lib/site/types";
import { type CartLine, useCart, writeCart } from "./cart";
import { track } from "./client";

type Service = "table" | "car" | "pickup";
export interface OrderingInfo {
  services: Record<Service, boolean>;
  timing: Record<Service, "before" | "after">;
  table_needs_confirmation: boolean;
  online_needs_confirmation: boolean;
  online_payment: boolean;
  vat_rate_bp: number;
  prices_include_vat: boolean;
  currency: string;
}

/** Same rounding as private.order_totals, for display only. */
function totals(subtotal: number, rateBp: number, inclusive: boolean) {
  const vat = inclusive ? Math.round((subtotal * rateBp) / (10000 + rateBp)) : Math.round((subtotal * rateBp) / 10000);
  return { vat, total: inclusive ? subtotal : subtotal + vat };
}

export function Checkout({ restaurantId, info, branches, defaultBranchId, tableLabel, profile, menuHref, orderPath, locale, s, defaultLocale }: {
  restaurantId: string; info: OrderingInfo; branches: { id: string; name: string; is_open: boolean }[];
  defaultBranchId: string | null; tableLabel: string | null; profile: { name: string; phone: string } | null;
  menuHref: string; orderPath: string; locale: string; defaultLocale: string; s: SiteStrings;
}) {
  const t = s.order;
  const router = useRouter();
  const cart = useCart(restaurantId);
  const available = (["table", "car", "pickup"] as Service[]).filter((k) => info.services[k] && (k !== "table" || tableLabel));
  const [service, setService] = useState<Service>(available[0] ?? "pickup");
  const [branchId, setBranchId] = useState<string>(defaultBranchId ?? (branches.length === 1 ? branches[0].id : ""));
  const [form, setForm] = useState({ carPlate: "", carDescription: "", name: profile?.name ?? "", phone: profile?.phone ?? "", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const started = useRef(false);
  const tx = (v: I18n | null | undefined) => (v ? v[locale] || v[defaultLocale] || Object.values(v)[0] || "" : "");
  const m = (minor: number) => money(minor, info.currency, locale);
  const { vat, total } = totals(cart.subtotal, info.vat_rate_bp, info.prices_include_vat);

  useEffect(() => {
    if (started.current || !cart.count) return;
    started.current = true;
    track(restaurantId, "checkout_started", { locale });
  }, [cart.count, restaurantId, locale]);

  const setQty = (line: CartLine, quantity: number) =>
    cart.set(quantity < 1 ? cart.lines.filter((l) => l.key !== line.key)
      : cart.lines.map((l) => (l.key === line.key ? { ...l, quantity: Math.min(50, quantity) } : l)));

  const submit = () => {
    setError(null);
    start(async () => {
      const result = await placeOrder({
        restaurantId, serviceType: service, branchId: service === "table" ? null : branchId || null,
        carPlate: form.carPlate, carDescription: form.carDescription, name: form.name, phone: form.phone, notes: form.notes,
        items: cart.lines.map((l) => ({ item_id: l.item_id, variant_id: l.variant_id, option_ids: l.option_ids, quantity: l.quantity, notes: l.notes })),
      });
      if (!result.ok) {
        setError(t.errors[result.code] ?? t.errors.generic);
        return;
      }
      writeCart(restaurantId, []);
      router.push(orderPath.replace("{key}", result.publicKey));
    });
  };

  if (!cart.count) {
    return (
      <div className="grid gap-4 px-4 py-10 text-center" data-testid="checkout-empty">
        <p>{t.empty}</p>
        <Link href={menuHref} className="gm-go mx-auto">{t.backToMenu}</Link>
      </div>
    );
  }

  const input = "h-11 w-full rounded-[var(--gm-radius)] border border-current/20 bg-transparent px-3";
  return (
    <div className="mx-auto grid max-w-xl gap-5 px-4 py-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t.yourOrder}</h1>
        <Link href={menuHref} className="gm-chip">{t.backToMenu}</Link>
      </div>

      <ul className="grid gap-3" data-testid="checkout-lines">
        {cart.lines.map((l) => (
          <li key={l.key} className="gm-card grid gap-2 p-3" data-testid="checkout-line">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold">{tx(l.name)}{l.variant_name ? ` · ${tx(l.variant_name)}` : ""}</p>
                {l.option_names.length ? <p className="text-sm opacity-80">{l.option_names.map(tx).join(", ")}</p> : null}
                {l.notes ? <p className="text-sm italic opacity-80">{l.notes}</p> : null}
              </div>
              <span className="shrink-0 font-semibold">{m(l.unit_price_minor * l.quantity)}</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="gm-chip size-8 justify-center" aria-label={t.decrease} onClick={() => setQty(l, l.quantity - 1)}>−</button>
              <span className="w-6 text-center">{l.quantity}</span>
              <button type="button" className="gm-chip size-8 justify-center" aria-label={t.increase} onClick={() => setQty(l, l.quantity + 1)}>+</button>
              <button type="button" className="ms-auto text-sm underline" onClick={() => setQty(l, 0)}>{t.remove}</button>
            </div>
          </li>
        ))}
      </ul>

      <fieldset className="grid gap-2">
        <legend className="mb-1 font-semibold">{t.howToGet}</legend>
        {available.map((k) => (
          <label key={k} className="gm-card flex items-center gap-3 p-3">
            <input type="radio" name="service" value={k} checked={service === k} onChange={() => setService(k)} />
            <span>{k === "table" ? `${t.serviceTable} · ${fmt(s.table, { label: tableLabel ?? "" })}` : k === "car" ? t.serviceCar : t.servicePickup}</span>
          </label>
        ))}
        {info.services.table && !tableLabel ? <p className="text-sm opacity-75">{t.serviceTableHint}</p> : null}
      </fieldset>

      {service !== "table" && branches.length > 1 ? (
        <label className="grid gap-1">
          <span className="font-semibold">{s.branch}</span>
          <select className={input} value={branchId} onChange={(e) => setBranchId(e.target.value)} data-testid="checkout-branch">
            <option value="">{s.chooseBranch}</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}{b.is_open ? "" : ` · ${s.closedNow}`}</option>)}
          </select>
        </label>
      ) : null}

      {service === "car" ? (
        <div className="grid gap-3">
          <label className="grid gap-1"><span>{t.carPlate}</span>
            <input className={input} dir="ltr" value={form.carPlate} maxLength={20} onChange={(e) => setForm({ ...form, carPlate: e.target.value })} /></label>
          <label className="grid gap-1"><span>{t.carDescription}</span>
            <input className={input} value={form.carDescription} maxLength={120} onChange={(e) => setForm({ ...form, carDescription: e.target.value })} /></label>
        </div>
      ) : null}

      <div className="grid gap-3">
        <label className="grid gap-1"><span>{t.name}</span>
          <input className={input} value={form.name} maxLength={80} autoComplete="name" onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="grid gap-1"><span>{t.phone}</span>
          <input className={input} dir="ltr" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label className="grid gap-1"><span>{t.orderNotes}</span>
          <textarea className={`${input} h-20 py-2`} value={form.notes} maxLength={500} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
      </div>

      <section className="gm-card grid gap-1 p-4" data-testid="checkout-totals">
        {info.vat_rate_bp > 0 && !info.prices_include_vat ? (
          <>
            <p className="flex justify-between"><span>{t.subtotal}</span><span>{m(cart.subtotal)}</span></p>
            <p className="flex justify-between"><span>{fmt(t.vatAdded, { rate: info.vat_rate_bp / 100 })}</span><span>{m(vat)}</span></p>
          </>
        ) : null}
        <p className="flex justify-between text-lg font-bold"><span>{t.total}</span><span data-testid="checkout-total">{m(total)}</span></p>
        {info.vat_rate_bp > 0 && info.prices_include_vat ? (
          <p className="text-sm opacity-75">{fmt(t.vatIncluded, { rate: info.vat_rate_bp / 100 })}: {m(vat)}</p>
        ) : null}
        <p className="text-sm opacity-75">{info.timing[service] === "after" ? t.payAfter : t.payBefore}</p>
        <p className="text-xs opacity-60">{t.estimate}</p>
      </section>

      {error ? <p role="alert" className="rounded-[var(--gm-radius)] bg-red-600/10 p-3 text-red-700" data-testid="checkout-error">{error}</p> : null}
      <button type="button" className="gm-go w-full justify-center text-lg" disabled={pending} onClick={submit} data-testid="place-order">
        {pending ? t.placing : t.place}
      </button>
    </div>
  );
}
