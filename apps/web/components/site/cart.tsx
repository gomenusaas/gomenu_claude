"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { fmt } from "@/lib/i18n/text";
import { money } from "@/lib/site/money";
import type { I18n } from "@/lib/site/types";
import { track } from "./client";

/**
 * The diner's cart lives in this browser only (localStorage, per restaurant). Prices here are
 * for display; place_order prices everything again from the current menu.
 */
export interface CartLine {
  key: string;
  item_id: string;
  variant_id: string | null;
  option_ids: string[];
  quantity: number;
  notes: string | null;
  name: I18n;
  variant_name: I18n | null;
  option_names: I18n[];
  unit_price_minor: number;
}

const storageKey = (restaurantId: string) => `gm_cart:${restaurantId}`;
const EVENT = "gm-cart";
const EMPTY: CartLine[] = [];
const cache = new Map<string, { raw: string | null; lines: CartLine[] }>();

function read(restaurantId: string): CartLine[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(storageKey(restaurantId));
  } catch {
    return EMPTY;
  }
  const hit = cache.get(restaurantId);
  if (hit && hit.raw === raw) return hit.lines;
  let lines: CartLine[] = EMPTY;
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    lines = Array.isArray(parsed) ? (parsed as CartLine[]) : EMPTY;
  } catch {
    lines = EMPTY;
  }
  cache.set(restaurantId, { raw, lines });
  return lines;
}

export function writeCart(restaurantId: string, lines: CartLine[]) {
  try {
    if (lines.length) localStorage.setItem(storageKey(restaurantId), JSON.stringify(lines));
    else localStorage.removeItem(storageKey(restaurantId));
  } catch {
    /* storage unavailable: the cart lasts for this page only */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function useCart(restaurantId: string) {
  const lines = useSyncExternalStore(subscribe, () => read(restaurantId), () => EMPTY);
  return {
    lines,
    count: lines.reduce((n, l) => n + l.quantity, 0),
    subtotal: lines.reduce((n, l) => n + l.unit_price_minor * l.quantity, 0),
    set: (next: CartLine[]) => writeCart(restaurantId, next),
  };
}

type Item = {
  id: string; name: I18n; price_minor: number;
  variants: { id: string; name: I18n; price_minor: number; is_default: boolean }[];
  option_groups: { id: string; name: I18n; min_select: number; max_select: number | null;
                   options: { id: string; name: I18n; price_delta_minor: number; is_available: boolean }[] }[];
};

export type AddLabels = {
  add: string; added: string; quantity: string; decrease: string; increase: string; notes: string; chooseSize: string;
  required: string; optional: string; choose: string; chooseUpTo: string; requiredMissing: string;
};

/** Size, options, quantity and a note, then into the cart. Rules mirror the server's checks. */
export function AddToCart({ restaurantId, item, tx, price, labels, branchId, locale }: {
  restaurantId: string; item: Item; tx: Record<string, string>; price: Record<string, string>; labels: AddLabels;
  branchId: string | null; locale: string;
}) {
  const cart = useCart(restaurantId);
  const defaultVariant = item.variants.find((v) => v.is_default) ?? item.variants[0] ?? null;
  const [variant, setVariant] = useState<string | null>(defaultVariant?.id ?? null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const unit = useMemo(() => {
    const base = item.variants.find((v) => v.id === variant)?.price_minor ?? item.price_minor;
    return base + item.option_groups.flatMap((g) => g.options).filter((o) => chosen.includes(o.id))
      .reduce((n, o) => n + o.price_delta_minor, 0);
  }, [item, variant, chosen]);

  const toggle = (groupId: string, optionId: string, max: number | null) => {
    const group = item.option_groups.find((g) => g.id === groupId)!;
    const inGroup = chosen.filter((id) => group.options.some((o) => o.id === id));
    if (chosen.includes(optionId)) return setChosen(chosen.filter((id) => id !== optionId));
    if (max === 1) return setChosen([...chosen.filter((id) => !inGroup.includes(id)), optionId]);
    if (max !== null && inGroup.length >= max) return;
    setChosen([...chosen, optionId]);
  };

  const add = () => {
    const missing = item.option_groups.find((g) => chosen.filter((id) => g.options.some((o) => o.id === id)).length < g.min_select);
    if (missing) return setMessage(labels.requiredMissing);
    const v = item.variants.find((x) => x.id === variant) ?? null;
    const options = item.option_groups.flatMap((g) => g.options).filter((o) => chosen.includes(o.id));
    const key = [item.id, variant ?? "", [...chosen].sort().join("+"), notes.trim()].join("|");
    const existing = cart.lines.find((l) => l.key === key);
    const next = existing
      ? cart.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, l.quantity + quantity) } : l))
      : [...cart.lines, {
          key, item_id: item.id, variant_id: v?.id ?? null, option_ids: chosen, quantity, notes: notes.trim() || null,
          name: item.name, variant_name: item.variants.length > 1 ? v?.name ?? null : null,
          option_names: options.map((o) => o.name), unit_price_minor: unit,
        }];
    cart.set(next);
    track(restaurantId, "add_to_cart", { entityId: item.id, branchId, locale });
    setMessage(labels.added);
    setQuantity(1);
    setNotes("");
  };

  return (
    <section className="mx-4 grid gap-4 gm-card p-4" data-testid="add-to-cart">
      {item.variants.length > 1 ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1 font-semibold">{labels.chooseSize}</legend>
          {item.variants.map((v) => (
            <label key={v.id} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <input type="radio" name="variant" checked={variant === v.id} onChange={() => setVariant(v.id)} />
                {tx[v.id]}
              </span>
              <span className="text-sm">{price[v.id]}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      {item.option_groups.map((g) => (
        <fieldset key={g.id} className="grid gap-2">
          <legend className="mb-1 flex w-full items-baseline justify-between gap-2">
            <span className="font-semibold">{tx[g.id]}</span>
            <span className="text-xs opacity-70">
              {g.min_select > 0 ? labels.required : labels.optional}
              {g.max_select ? ` · ${g.min_select > 0 ? fmt(labels.choose, { min: g.min_select, max: g.max_select }) : fmt(labels.chooseUpTo, { max: g.max_select })}` : ""}
            </span>
          </legend>
          {g.options.map((o) => (
            <label key={o.id} className={`flex items-center justify-between gap-2 ${o.is_available ? "" : "opacity-50"}`}>
              <span className="flex items-center gap-2">
                <input type={g.max_select === 1 ? "radio" : "checkbox"} name={`g-${g.id}`} disabled={!o.is_available}
                       checked={chosen.includes(o.id)} onChange={() => toggle(g.id, o.id, g.max_select)} />
                {tx[o.id]}
              </span>
              {o.price_delta_minor ? <span className="text-sm">+{price[o.id]}</span> : null}
            </label>
          ))}
        </fieldset>
      ))}
      <label className="grid gap-1 text-sm">
        <span>{labels.notes}</span>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200}
               className="h-10 rounded-[var(--gm-radius)] border border-current/20 bg-transparent px-3" />
      </label>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2" role="group" aria-label={labels.quantity}>
          <button type="button" className="gm-chip size-9 justify-center" aria-label={labels.decrease}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}>−</button>
          <span className="w-6 text-center font-semibold" data-testid="add-quantity">{quantity}</span>
          <button type="button" className="gm-chip size-9 justify-center" aria-label={labels.increase}
                  onClick={() => setQuantity((q) => Math.min(50, q + 1))}>+</button>
        </div>
        <button type="button" className="gm-go" onClick={add} data-testid="add-to-cart-button">{labels.add}</button>
      </div>
      {message ? <p role="status" className="text-sm" data-testid="add-to-cart-message">{message}</p> : null}
    </section>
  );
}

/** Sticky "View order" bar on the website while the cart has something in it. */
export function CartBar({ restaurantId, href, label, itemsLabel, oneItemLabel, currency, locale }: {
  restaurantId: string; href: string; label: string; itemsLabel: string; oneItemLabel: string; currency: string; locale: string;
}) {
  const cart = useCart(restaurantId);
  if (!cart.count) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 p-3">
      <Link href={href} data-testid="cart-bar"
            className="gm-go mx-auto flex max-w-xl items-center justify-between gap-3 shadow-lg">
        <span>{label} · {cart.count === 1 ? oneItemLabel : fmt(itemsLabel, { n: cart.count })}</span>
        <span>{money(cart.subtotal, currency, locale)}</span>
      </Link>
    </div>
  );
}
