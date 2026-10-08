import { Badge, Card, CardContent, CardHeader, CardTitle, Field, Input } from "@gomenu/ui";
import { adjustAiCredits, grantTrial, setHold, setOverride } from "@/app/actions/platform";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { formatDate, formatMoney } from "@/lib/format";
import { requirePlatformRole } from "@/lib/auth/platform";
import { createClient } from "@/lib/supabase/server";

type Detail = {
  restaurant: { id: string; name: string; slug: string; status: string; platform_hold: boolean; platform_hold_reason: string | null; created_at: string };
  effective_plan_key: string | null;
  periods: { id: string; kind: string; plan_key: string; starts_at: string; ends_at: string; extra_branches: number; superseded_by: string | null }[];
  invoices: { id: string; number: string; kind: string; status: string; total_minor: number; currency: string; issued_at: string }[];
  payments: { id: string; amount_minor: number; currency: string; method: string; reference: string; received_at: string }[];
  trial_grants: { id: string; source: string; reason: string | null; granted_at: string }[];
  overrides: { feature_key: string; enabled: boolean; limit_value: number | null; reason: string; expires_at: string | null }[];
};

// Billing-account view (audited by the RPC). Tenant operational data is not shown here.
export default async function PlatformRestaurant({ params }: { params: Promise<{ restaurantId: string }> }) {
  await requirePlatformRole(["super_admin", "admin", "finance", "support"]);
  const { restaurantId } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_restaurant_billing", { p_restaurant_id: restaurantId });
  if (error) return <p className="text-destructive">{error.message}</p>;
  const d = data as unknown as Detail;
  const r = d.restaurant;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">{r.name}</h1>
        <Badge>{r.status}</Badge>
        {r.platform_hold ? <Badge tone="danger">hold: {r.platform_hold_reason}</Badge> : null}
        <span className="text-sm text-muted-foreground">plan: {d.effective_plan_key ?? "—"}</span>
      </div>

      <Card><CardHeader><CardTitle as="h2" className="text-base">Periods</CardTitle></CardHeader><CardContent>
        <ul className="grid gap-1 text-sm">{d.periods.map((p) => (
          <li key={p.id} className={p.superseded_by ? "text-muted-foreground line-through" : ""}>
            {p.kind} · {p.plan_key} · {formatDate(p.starts_at, "en")} → {formatDate(p.ends_at, "en")} · extra branches {p.extra_branches}
          </li>))}</ul>
      </CardContent></Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader><CardTitle as="h2" className="text-base">Invoices</CardTitle></CardHeader><CardContent>
          <ul className="grid gap-1 text-sm">{d.invoices.map((i) => (
            <li key={i.id}>{i.number} · {i.kind} · {i.status} · {formatMoney(i.total_minor, i.currency, "en")} · {formatDate(i.issued_at, "en")}</li>))}</ul>
        </CardContent></Card>
        <Card><CardHeader><CardTitle as="h2" className="text-base">Payments</CardTitle></CardHeader><CardContent>
          <ul className="grid gap-1 text-sm">{d.payments.map((p) => (
            <li key={p.id}>{formatMoney(p.amount_minor, p.currency, "en")} · {p.method} · {p.reference} · {formatDate(p.received_at, "en")}</li>))}</ul>
        </CardContent></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader><CardTitle as="h2" className="text-base">Grant trial exception</CardTitle></CardHeader><CardContent>
          <ActionForm action={grantTrial}>
            <input type="hidden" name="restaurant_id" value={r.id} />
            <Field id="days" label="Days"><Input name="days" type="number" min={1} max={120} defaultValue={30} /></Field>
            <Field id="trial_reason" label="Reason"><Input name="reason" required /></Field>
            <SubmitButton>Grant trial</SubmitButton>
          </ActionForm>
        </CardContent></Card>
        <Card><CardHeader><CardTitle as="h2" className="text-base">{r.platform_hold ? "Release hold" : "Suspend manually"}</CardTitle></CardHeader><CardContent>
          <ActionForm action={setHold}>
            <input type="hidden" name="restaurant_id" value={r.id} />
            <input type="hidden" name="hold" value={String(!r.platform_hold)} />
            <Field id="hold_reason" label="Reason"><Input name="reason" required /></Field>
            <SubmitButton variant={r.platform_hold ? "primary" : "destructive"}>{r.platform_hold ? "Release" : "Suspend"}</SubmitButton>
          </ActionForm>
        </CardContent></Card>
        <Card><CardHeader><CardTitle as="h2" className="text-base">AI credits</CardTitle></CardHeader><CardContent>
          <ActionForm action={adjustAiCredits}>
            <input type="hidden" name="restaurant_id" value={r.id} />
            <Field id="delta" label="Add (or remove, with a minus sign)"><Input name="delta" type="number" required /></Field>
            <Field id="credits_reason" label="Reason"><Input name="reason" required /></Field>
            <SubmitButton>Adjust credits</SubmitButton>
          </ActionForm>
        </CardContent></Card>
        <Card><CardHeader><CardTitle as="h2" className="text-base">Entitlement override</CardTitle></CardHeader><CardContent>
          <ActionForm action={setOverride}>
            <input type="hidden" name="restaurant_id" value={r.id} />
            <Field id="feature_key" label="Feature key"><Input name="feature_key" placeholder="e.g. frames" required /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked /> Enabled</label>
            <Field id="limit" label="Limit (blank = unlimited/none)"><Input name="limit" type="number" min={0} /></Field>
            <Field id="expires_at" label="Expires (optional)"><Input name="expires_at" type="date" /></Field>
            <Field id="override_reason" label="Reason"><Input name="reason" required /></Field>
            <SubmitButton>Save override</SubmitButton>
          </ActionForm>
          <ul className="mt-3 grid gap-1 text-sm">{d.overrides.map((o) => (
            <li key={o.feature_key}>{o.feature_key}: {String(o.enabled)} {o.limit_value ?? ""} — {o.reason}</li>))}</ul>
        </CardContent></Card>
      </div>
    </div>
  );
}
