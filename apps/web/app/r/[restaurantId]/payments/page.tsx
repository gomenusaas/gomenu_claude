import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@gomenu/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connectGateway, disconnectGateway } from "@/app/actions/orders";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth/context";
import { fmt, getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Payments" };

type Gateway = { key: string; name: string; provider: string; environment: "sandbox" | "production"; methods: string[];
  status: string; connection_status: string; public_config: Record<string, string>; connected_at: string | null; last_error: string | null };

/** spec §11: each restaurant connects its own merchant gateway (owners, fresh re-auth). */
export default async function PaymentsSettings({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const ctx = await requireUser();
  if (!ctx.active_memberships?.some((m) => m.restaurant_id === restaurantId)) notFound();
  const { locale, t } = await getDictionary();
  const supabase = await createClient();
  const [{ data: perms }, { data: list }, { data: ents }, { data: events }] = await Promise.all([
    supabase.rpc("my_permissions", { p_restaurant_id: restaurantId }),
    supabase.rpc("list_payment_gateways", { p_restaurant_id: restaurantId }),
    supabase.rpc("restaurant_entitlements", { p_restaurant_id: restaurantId }),
    supabase.from("payment_webhook_events").select("id, type, result, received_at").eq("restaurant_id", restaurantId)
      .order("received_at", { ascending: false }).limit(10),
  ]);
  if (!(perms ?? []).includes("payments.manage")) notFound();
  const gateways = (list ?? []) as unknown as Gateway[];
  const included = Boolean((ents as { features?: Record<string, { enabled?: boolean }> } | null)?.features?.gateway?.enabled);
  const base = { restaurant_id: restaurantId };
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.payments.title}</h1>
        <p className="text-muted-foreground">{t.payments.body}</p>
      </div>
      {!gateways.length ? <Alert tone="info">{included ? t.payments.none : t.payments.notIncluded}</Alert> : null}
      <p className="text-sm text-muted-foreground">
        {t.payments.enableHint} <Link className="underline" href={`/r/${restaurantId}/website`}>{t.website.nav}</Link>
      </p>
      <ul className="grid gap-4">
        {gateways.map((g) => (
          <li key={g.key}>
            <Card data-testid="gateway" data-gateway={g.key}>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle as="h2" className="text-base">{g.name}</CardTitle>
                  <CardDescription>{fmt(t.payments.methods, { list: g.methods.join(", ") })}</CardDescription>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Badge data-testid="gateway-status">{t.payments.status[g.connection_status] ?? g.connection_status}</Badge>
                  {g.environment === "sandbox" ? <Badge>{t.payments.sandbox}</Badge> : null}
                </div>
              </CardHeader>
              <CardContent className="grid gap-3">
                {g.provider === "test" ? <p className="text-sm text-muted-foreground">{t.payments.testHint}</p> : null}
                {g.last_error ? <Alert tone="danger">{g.last_error}</Alert> : null}
                {g.connection_status === "connected" ? (
                  <ActionForm action={disconnectGateway}>
                    {Object.entries({ ...base, gateway: g.key }).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
                    <div><SubmitButton variant="outline" size="sm" data-testid="gateway-disconnect">{t.payments.disconnect}</SubmitButton></div>
                  </ActionForm>
                ) : (
                  <ActionForm action={connectGateway}>
                    {Object.entries({ ...base, gateway: g.key, provider: g.provider }).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
                    <div><SubmitButton size="sm" data-testid="gateway-connect">{t.payments.connect}</SubmitButton></div>
                  </ActionForm>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      <Card>
        <CardHeader><CardTitle as="h2" className="text-base">{t.payments.recent}</CardTitle></CardHeader>
        <CardContent>
          {(events ?? []).length ? (
            <ul className="grid gap-1 text-sm">
              {(events ?? []).map((e) => (
                <li key={e.id} className="flex flex-wrap justify-between gap-2 border-b py-1">
                  <span dir="ltr">{e.type} → {e.result}</span>
                  <span className="text-muted-foreground">{new Date(e.received_at).toLocaleString(locale === "ar" ? "ar-OM" : "en-GB")}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">{t.payments.noEvents}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
