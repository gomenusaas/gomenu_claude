"use client";

import { Alert, Button, Input, Label } from "@gomenu/ui";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { type ComposerLine, createWaiterOrder, editOrderItems } from "@/app/actions/orders";
import { tx } from "@/lib/i18n/text";
import type { ComposerItem, ComposerMenu } from "@/lib/orders/menu";
import { money } from "@/lib/site/money";

type Line = ComposerLine & { key: string; label: string; unit: number };
type Labels = {
  title: string; service: string; table: string; chooseTable: string; car: string; plate: string; carDescription: string;
  customer: string; notes: string; menu: string; add: string; size: string; lines: string; empty: string; remove: string;
  place: string; noTables: string; branch: string; save: string; total: string; editWarning: string;
  errors: Record<string, string>;
};

const select = "h-11 w-full rounded-md border border-input bg-background px-3";

/** Waiter orders (table or car) and controlled edits. The database prices and validates. */
export function OrderComposer({ restaurantId, branches, defaultBranchId, tables, menu, currency, locale, labels, edit }: {
  restaurantId: string; branches: { id: string; name: string }[]; defaultBranchId: string;
  tables: { id: string; branch_id: string; label: string }[]; menu: ComposerMenu; currency: string; locale: string; labels: Labels;
  edit?: { orderId: string; branchId: string; lines: Line[]; afterStart: boolean };
}) {
  const router = useRouter();
  const [branchId, setBranchId] = useState(edit?.branchId ?? defaultBranchId);
  const [service, setService] = useState<"table" | "car">("table");
  const [tableId, setTableId] = useState("");
  const [form, setForm] = useState({ plate: "", carDescription: "", customer: "", notes: "" });
  const [lines, setLines] = useState<Line[]>(edit?.lines ?? []);
  const [config, setConfig] = useState<{ item: ComposerItem; variant: string | null; options: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const m = (minor: number) => money(minor, currency, locale);
  const t = (v: Record<string, string>) => tx(v, locale);

  const blocked = useMemo(() => new Set(menu.unavailable.filter((u) => u.branch_id === branchId).flatMap((u) => [u.item_id, u.category_id])), [menu, branchId]);
  const branchTables = tables.filter((x) => x.branch_id === branchId);

  const addLine = (item: ComposerItem, variantId: string | null, optionIds: string[]) => {
    const variant = item.variants.find((v) => v.id === variantId) ?? null;
    const options = item.groups.flatMap((g) => g.options).filter((o) => optionIds.includes(o.id));
    const unit = (variant?.price_minor ?? item.price_minor) + options.reduce((n, o) => n + o.price_delta_minor, 0);
    const label = [t(item.name), variant && item.variants.length > 1 ? t(variant.name) : null, ...options.map((o) => t(o.name))].filter(Boolean).join(" · ");
    const key = [item.id, variantId ?? "", [...optionIds].sort().join("+")].join("|");
    setLines((ls) => ls.some((l) => l.key === key)
      ? ls.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, l.quantity + 1) } : l))
      : [...ls, { key, item_id: item.id, variant_id: variantId, option_ids: optionIds, quantity: 1, notes: null, label, unit }]);
    setConfig(null);
  };
  const choose = (item: ComposerItem) => {
    const defaultVariant = item.variants.find((v) => v.is_default)?.id ?? item.variants[0]?.id ?? null;
    if (item.variants.length <= 1 && item.groups.length === 0) addLine(item, defaultVariant, []);
    else setConfig({ item, variant: defaultVariant, options: [] });
  };

  const submit = () => start(async () => {
    setError(null);
    const items = lines.map(({ item_id, variant_id, option_ids, quantity, notes }) => ({ item_id, variant_id, option_ids, quantity, notes }));
    const result = edit
      ? await editOrderItems({ restaurantId, orderId: edit.orderId, items })
      : await createWaiterOrder({ restaurantId, branchId, serviceType: service, tableId, carPlate: form.plate,
          carDescription: form.carDescription, customerName: form.customer, notes: form.notes, items });
    if (!result.ok) return setError(labels.errors[result.code] ?? labels.errors.WRONG_STATUS);
    router.push(`/r/${restaurantId}/orders/${edit ? edit.orderId : (result as { orderId: string }).orderId}`);
  });

  const total = lines.reduce((n, l) => n + l.unit * l.quantity, 0);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="grid content-start gap-4">
        {edit?.afterStart ? <Alert tone="warning">{labels.editWarning}</Alert> : null}
        {!edit ? (
          <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
            {branches.length > 1 ? (
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="c-branch">{labels.branch}</Label>
                <select id="c-branch" className={select} value={branchId} onChange={(e) => { setBranchId(e.target.value); setTableId(""); }}>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            ) : null}
            <fieldset className="flex gap-4 sm:col-span-2">
              <legend className="mb-1 text-sm font-medium">{labels.service}</legend>
              <label className="flex items-center gap-2"><input type="radio" checked={service === "table"} onChange={() => setService("table")} /> {labels.table}</label>
              <label className="flex items-center gap-2"><input type="radio" checked={service === "car"} onChange={() => setService("car")} /> {labels.car}</label>
            </fieldset>
            {service === "table" ? (
              <div className="grid gap-2">
                <Label htmlFor="c-table">{labels.table}</Label>
                {branchTables.length ? (
                  <select id="c-table" className={select} value={tableId} onChange={(e) => setTableId(e.target.value)} data-testid="composer-table">
                    <option value="">{labels.chooseTable}</option>
                    {branchTables.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </select>
                ) : <p className="text-sm text-muted-foreground">{labels.noTables}</p>}
              </div>
            ) : (
              <>
                <div className="grid gap-2"><Label htmlFor="c-plate">{labels.plate}</Label>
                  <Input id="c-plate" dir="ltr" value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} /></div>
                <div className="grid gap-2"><Label htmlFor="c-car">{labels.carDescription}</Label>
                  <Input id="c-car" value={form.carDescription} onChange={(e) => setForm({ ...form, carDescription: e.target.value })} /></div>
              </>
            )}
            <div className="grid gap-2"><Label htmlFor="c-customer">{labels.customer}</Label>
              <Input id="c-customer" value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} /></div>
            <div className="grid gap-2"><Label htmlFor="c-notes">{labels.notes}</Label>
              <Input id="c-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
        ) : null}

        <section aria-label={labels.menu} className="grid gap-4">
          {menu.categories.filter((c) => !blocked.has(c.id)).map((c) => {
            const items = menu.items.filter((i) => i.category_id === c.id && !blocked.has(i.id) && i.is_available);
            if (!items.length) return null;
            return (
              <div key={c.id} className="grid gap-2">
                <h2 className="font-semibold">{t(c.name)}</h2>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {items.map((i) => (
                    <li key={i.id}>
                      <button type="button" onClick={() => choose(i)} data-testid="composer-item"
                              className="flex w-full items-center justify-between gap-2 rounded-md border p-3 text-start hover:bg-muted">
                        <span>{t(i.name)}</span>
                        <span className="text-sm text-muted-foreground">{m(i.variants.find((v) => v.is_default)?.price_minor ?? i.variants[0]?.price_minor ?? i.price_minor)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>

        {config ? (
          <div role="dialog" aria-modal="true" aria-label={t(config.item.name)}
               className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={() => setConfig(null)}>
            <div className="grid w-full max-w-sm gap-3 rounded-lg bg-card p-4 shadow-md" onClick={(e) => e.stopPropagation()}>
              <h2 className="font-semibold">{t(config.item.name)}</h2>
              {config.item.variants.length > 1 ? (
                <div className="grid gap-2">
                  <Label htmlFor="c-size">{labels.size}</Label>
                  <select id="c-size" className={select} value={config.variant ?? ""} onChange={(e) => setConfig({ ...config, variant: e.target.value })}>
                    {config.item.variants.map((v) => <option key={v.id} value={v.id}>{t(v.name)} · {m(v.price_minor)}</option>)}
                  </select>
                </div>
              ) : null}
              {config.item.groups.map((g) => (
                <fieldset key={g.id} className="grid gap-1">
                  <legend className="text-sm font-medium">{t(g.name)}</legend>
                  {g.options.map((o) => (
                    <label key={o.id} className={`flex items-center gap-2 text-sm ${o.is_available ? "" : "opacity-50"}`}>
                      <input type="checkbox" disabled={!o.is_available} checked={config.options.includes(o.id)}
                             onChange={(e) => setConfig({ ...config, options: e.target.checked ? [...config.options, o.id] : config.options.filter((x) => x !== o.id) })} />
                      {t(o.name)}{o.price_delta_minor ? ` +${m(o.price_delta_minor)}` : ""}
                    </label>
                  ))}
                </fieldset>
              ))}
              <Button onClick={() => addLine(config.item, config.variant, config.options)} data-testid="composer-add">{labels.add}</Button>
            </div>
          </div>
        ) : null}
      </div>

      <aside className="grid content-start gap-3 rounded-lg border p-4 lg:sticky lg:top-4">
        <h2 className="font-semibold">{labels.lines}</h2>
        {lines.length ? (
          <ul className="grid gap-2" data-testid="composer-lines">
            {lines.map((l) => (
              <li key={l.key} className="grid gap-1 border-b pb-2 text-sm">
                <div className="flex justify-between gap-2"><span>{l.label}</span><span>{m(l.unit * l.quantity)}</span></div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" aria-label="−" onClick={() => setLines(lines.map((x) => (x.key === l.key ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x)))}>−</Button>
                  <span className="w-6 text-center">{l.quantity}</span>
                  <Button size="sm" variant="outline" aria-label="+" onClick={() => setLines(lines.map((x) => (x.key === l.key ? { ...x, quantity: Math.min(50, x.quantity + 1) } : x)))}>+</Button>
                  <button type="button" className="ms-auto underline" onClick={() => setLines(lines.filter((x) => x.key !== l.key))}>{labels.remove}</button>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">{labels.empty}</p>}
        <p className="flex justify-between font-semibold"><span>{labels.total}</span><span>{m(total)}</span></p>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Button onClick={submit} disabled={pending || !lines.length} data-testid="composer-submit">{edit ? labels.save : labels.place}</Button>
      </aside>
    </div>
  );
}
