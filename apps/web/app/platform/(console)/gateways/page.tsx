import { Badge, Card, CardContent, CardHeader, CardTitle, Field, Input, Label } from "@gomenu/ui";
import { setGatewayTerms, upsertGateway } from "@/app/actions/platform";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { requirePlatformRole } from "@/lib/auth/platform";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Payment gateways" };

type Gateway = { id: string; key: string; name: string; provider: string; environment: string; countries: string[];
  currencies: string[]; methods: string[]; status: string; sort: number; connections: number;
  terms: { fee_bp?: number; fixed_fee_minor?: number; currency?: string; notes?: string } };

const STATUSES = ["draft", "testing", "active", "disabled", "retired"];
const select = "h-11 rounded-md border border-input bg-background px-3";

function GatewayForm({ g, canEdit }: { g?: Gateway; canEdit: boolean }) {
  const id = g?.key ?? "new";
  return (
    <ActionForm action={upsertGateway}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id={`key-${id}`} label="Key"><Input name="key" defaultValue={g?.key ?? ""} readOnly={Boolean(g)} required /></Field>
        <Field id={`name-${id}`} label="Name"><Input name="name" defaultValue={g?.name ?? ""} required /></Field>
        <Field id={`provider-${id}`} label="Adapter (app code)"><Input name="provider" defaultValue={g?.provider ?? "test"} /></Field>
        <Field id={`countries-${id}`} label="Countries (ISO, comma-separated; empty = all)"><Input name="countries" defaultValue={g?.countries.join(", ") ?? "OM"} /></Field>
        <Field id={`currencies-${id}`} label="Currencies"><Input name="currencies" defaultValue={g?.currencies.join(", ") ?? "OMR"} /></Field>
        <Field id={`methods-${id}`} label="Methods"><Input name="methods" defaultValue={g?.methods.join(", ") ?? "card"} /></Field>
        <div className="grid gap-2">
          <Label htmlFor={`env-${id}`}>Environment</Label>
          <select id={`env-${id}`} name="environment" defaultValue={g?.environment ?? "sandbox"} className={select}>
            <option value="sandbox">Sandbox</option><option value="production">Production</option>
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`status-${id}`}>Status</Label>
          <select id={`status-${id}`} name="status" defaultValue={g?.status ?? "draft"} className={select}>
            {STATUSES.map((x) => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}
          </select>
        </div>
        <Field id={`sort-${id}`} label="Order"><Input name="sort" type="number" defaultValue={g?.sort ?? 100} /></Field>
      </div>
      {canEdit ? <div><SubmitButton size="sm">{g ? "Save" : "Add gateway"}</SubmitButton></div> : null}
    </ActionForm>
  );
}

/** spec §11: platform-managed gateways and private commercial terms (never shown to restaurants). */
export default async function PlatformGateways() {
  const me = await requirePlatformRole(["super_admin", "admin", "finance"]);
  const canEdit = me.platform_role === "super_admin" || me.platform_role === "admin";
  const supabase = await createClient();
  const { data } = await supabase.rpc("platform_list_gateways");
  const gateways = (data ?? []) as unknown as Gateway[];
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Payment gateways</h1>
      <p className="text-sm text-muted-foreground">
        Restaurants see gateways that are Active (Testing too when the platform setting allows it), match their country and currency,
        and are included in their plan. Each restaurant connects its own merchant account; funds settle to the restaurant.
      </p>
      {gateways.map((g) => (
        <Card key={g.key} data-testid="platform-gateway">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle as="h2" className="text-base">{g.name}</CardTitle>
            <div className="flex gap-1"><Badge>{g.status}</Badge><Badge>{g.connections} connected</Badge></div>
          </CardHeader>
          <CardContent className="grid gap-6">
            <GatewayForm g={g} canEdit={canEdit} />
            <ActionForm action={setGatewayTerms}>
              <input type="hidden" name="key" value={g.key} />
              <p className="text-sm font-medium">Commercial terms (private to GoMenu)</p>
              <div className="grid gap-3 sm:grid-cols-4">
                <Field id={`fee-${g.key}`} label="Fee %"><Input name="fee_percent" inputMode="decimal" defaultValue={g.terms.fee_bp != null ? String(g.terms.fee_bp / 100) : ""} /></Field>
                <Field id={`fixed-${g.key}`} label="Fixed fee"><Input name="fixed_fee" inputMode="decimal" defaultValue={g.terms.fixed_fee_minor != null ? String(g.terms.fixed_fee_minor / 1000) : ""} /></Field>
                <Field id={`cur-${g.key}`} label="Currency"><Input name="currency" defaultValue={g.terms.currency ?? "OMR"} /></Field>
                <Field id={`notes-${g.key}`} label="Notes"><Input name="notes" defaultValue={g.terms.notes ?? ""} /></Field>
              </div>
              <div><SubmitButton size="sm" variant="outline">Save terms</SubmitButton></div>
            </ActionForm>
          </CardContent>
        </Card>
      ))}
      {canEdit ? (
        <Card>
          <CardHeader><CardTitle as="h2" className="text-base">Add a gateway</CardTitle></CardHeader>
          <CardContent><GatewayForm canEdit /></CardContent>
        </Card>
      ) : null}
    </div>
  );
}
