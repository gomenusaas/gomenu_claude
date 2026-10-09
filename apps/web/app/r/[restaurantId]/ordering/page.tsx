import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "@gomenu/ui";
import { notFound } from "next/navigation";
import { saveOrderingSettings, setTableWaiter } from "@/app/actions/orders";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth/context";
import { getDictionary } from "@/lib/i18n";
import { orderContext } from "@/lib/orders/data";

export const metadata = { title: "Ordering settings" };

const select = "h-11 rounded-md border border-input bg-background px-3";

/** spec §10: confirmation, assignment mode, services, payment timing; decision P5: VAT per restaurant. */
export default async function OrderingSettings({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const ctx = await requireUser();
  if (!ctx.active_memberships?.some((m) => m.restaurant_id === restaurantId)) notFound();
  const { t } = await getDictionary();
  const oc = await orderContext(restaurantId, ctx.user_id!);
  if (!oc.can("settings.manage") || !oc.settings) notFound();
  const s = oc.settings;
  const check = (name: string, label: string, checked: boolean, hint?: string) => (
    <label className="flex items-start gap-2">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-1" />
      <span>{label}{hint ? <span className="block text-sm text-muted-foreground">{hint}</span> : null}</span>
    </label>
  );
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.ordering.title}</h1>
        <p className="text-muted-foreground">{t.ordering.body}</p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <ActionForm action={saveOrderingSettings}>
            <input type="hidden" name="restaurant_id" value={restaurantId} />
            {check("waiter_confirmation", t.ordering.confirmation, s.waiter_confirmation, t.ordering.confirmationHint)}
            <fieldset className="grid gap-2">
              <legend className="mb-1 font-medium">{t.ordering.mode}</legend>
              {(["open", "table", "manager", "none"] as const).map((mode) => (
                <label key={mode} className="flex items-center gap-2">
                  <input type="radio" name="assignment_mode" value={mode} defaultChecked={s.assignment_mode === mode} /> {t.ordering.modes[mode]}
                </label>
              ))}
            </fieldset>
            {check("auto_accept_online", t.ordering.autoAccept, s.auto_accept_online)}
            <fieldset className="grid gap-3">
              <legend className="mb-1 font-medium">{t.ordering.services} · {t.ordering.timing}</legend>
              {(["table", "car", "pickup"] as const).map((k) => (
                <div key={k} className="flex flex-wrap items-center gap-3">
                  <label className="flex w-40 items-center gap-2">
                    <input type="checkbox" name={`service_${k}`} defaultChecked={s[`service_${k}`]} /> {t.ordering.service[k]}
                  </label>
                  <select name={`timing_${k}`} defaultValue={s[`timing_${k}`]} className={select} aria-label={`${t.ordering.timing}: ${t.ordering.service[k]}`}>
                    <option value="before">{t.ordering.before}</option>
                    <option value="after">{t.ordering.after}</option>
                  </select>
                </div>
              ))}
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="vat_rate" label={t.ordering.vat}>
                <Input name="vat_rate" inputMode="decimal" defaultValue={String(s.vat_rate_bp / 100)} className="w-32" />
              </Field>
              <Field id="kitchen_delay_minutes" label={t.ordering.delay}>
                <Input name="kitchen_delay_minutes" type="number" min={1} max={240} defaultValue={s.kitchen_delay_minutes} className="w-32" />
              </Field>
            </div>
            {check("prices_include_vat", t.ordering.vatIncluded, s.prices_include_vat)}
            <div><SubmitButton>{t.common.save}</SubmitButton></div>
          </ActionForm>
        </CardContent>
      </Card>

      {oc.can("orders.manage") && oc.tables.length ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">{t.ordering.tables}</CardTitle>
            <CardDescription>{t.ordering.tablesBody}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {oc.tables.map((table) => (
                <li key={table.id}>
                  <ActionForm action={setTableWaiter} className="flex items-center gap-2" quiet>
                    <input type="hidden" name="restaurant_id" value={restaurantId} />
                    <input type="hidden" name="table_id" value={table.id} />
                    <span className="w-20 font-medium">{table.label}</span>
                    <select name="waiter_id" defaultValue={table.assigned_waiter_id ?? ""} className={`${select} h-9 text-sm`} aria-label={table.label}>
                      <option value="">{t.orders.nobody}</option>
                      {(oc.staffByBranch.get(table.branch_id) ?? []).map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                    </select>
                    <SubmitButton size="sm" variant="ghost">{t.common.save}</SubmitButton>
                  </ActionForm>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
