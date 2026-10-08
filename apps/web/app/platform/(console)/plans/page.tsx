import { Card, CardContent, CardHeader, CardTitle, Field, Input } from "@gomenu/ui";
import { setPlanEntitlements, setPrice } from "@/app/actions/platform";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { formatMoney } from "@/lib/format";
import { requirePlatformRole } from "@/lib/auth/platform";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Plans & prices" };

// Centralised entitlements (spec §6): edited here, enforced by private.has_feature().
export default async function PlatformPlans() {
  await requirePlatformRole(["super_admin", "admin"]);
  const supabase = await createClient();
  const [{ data: plans }, { data: features }, { data: ents }, { data: prices }] = await Promise.all([
    supabase.from("plans").select("id, key, name").order("sort"),
    supabase.from("features").select("key, name, kind").order("sort"),
    supabase.from("plan_entitlements").select("plan_id, feature_key, enabled, limit_value"),
    supabase.from("billing_prices").select("id, item_type, plan_id, currency, amount_minor, active_from").is("active_until", null),
  ]);
  const priceFor = (planId: string | null, item: string) => prices?.find((p) => p.item_type === item && p.plan_id === planId);
  const branch = priceFor(null, "extra_branch");

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Plans & prices</h1>
      <div className="grid gap-4 md:grid-cols-3">
        {(plans ?? []).map((p) => {
          const price = priceFor(p.id, "plan");
          return (
            <Card key={p.id}><CardHeader><CardTitle as="h2" className="text-base">{p.name} (per year)</CardTitle></CardHeader><CardContent>
              <p className="mb-2 text-sm">Current: {price ? formatMoney(price.amount_minor, price.currency, "en") : "—"}</p>
              <ActionForm action={setPrice}>
                <input type="hidden" name="item_type" value="plan" /><input type="hidden" name="plan_key" value={p.key} />
                <Field id={`price-${p.key}`} label="New price (USD)"><Input name="amount" type="number" step="0.01" min={0} required /></Field>
                <SubmitButton size="sm">Save price</SubmitButton>
              </ActionForm>
            </CardContent></Card>
          );
        })}
        <Card><CardHeader><CardTitle as="h2" className="text-base">Extra branch (per year)</CardTitle></CardHeader><CardContent>
          <p className="mb-2 text-sm">Current: {branch ? formatMoney(branch.amount_minor, branch.currency, "en") : "—"}</p>
          <ActionForm action={setPrice}>
            <input type="hidden" name="item_type" value="extra_branch" />
            <Field id="price-branch" label="New price (USD)"><Input name="amount" type="number" step="0.01" min={0} required /></Field>
            <SubmitButton size="sm">Save price</SubmitButton>
          </ActionForm>
        </CardContent></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {(plans ?? []).map((p) => (
          <Card key={p.id}><CardHeader><CardTitle as="h2" className="text-base">{p.name} entitlements</CardTitle></CardHeader><CardContent>
            <ActionForm action={setPlanEntitlements}>
              <input type="hidden" name="plan_key" value={p.key} />
              <div className="grid gap-2 text-sm">
                {(features ?? []).map((f) => {
                  const e = ents?.find((x) => x.plan_id === p.id && x.feature_key === f.key);
                  return (
                    <div key={f.key} className="flex items-center justify-between gap-2">
                      <input type="hidden" name="feature_key" value={f.key} />
                      <label className="flex items-center gap-2"><input type="checkbox" name={`enabled:${f.key}`} defaultChecked={e?.enabled} /> {f.name}</label>
                      {f.kind === "limit" ? (
                        <Input name={`limit:${f.key}`} type="number" min={0} defaultValue={e?.limit_value ?? ""} placeholder="∞" className="h-9 w-20" />
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <SubmitButton size="sm">Save entitlements</SubmitButton>
            </ActionForm>
          </CardContent></Card>
        ))}
      </div>
    </div>
  );
}
