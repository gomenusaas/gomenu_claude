import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "@gomenu/ui";
import { notFound } from "next/navigation";
import { buyCredits } from "@/app/actions/ai";
import { buyExtraBranches, choosePlan, upgradePlan } from "@/app/actions/billing";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { requireUser, type RestaurantStatus } from "@/lib/auth/context";
import { formatDate, formatMoney, isWithinDays } from "@/lib/format";
import { fmt, getDictionary } from "@/lib/i18n";
import type { PublicPricing } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Billing" };

interface Invoice {
  id: string; number: string; kind: string; status: "open" | "paid" | "void"; currency: string;
  lines: { description: string; quantity: number; amount_minor: number }[];
  subtotal_minor: number; tax_label: string; tax_rate_bp: number; tax_minor: number; total_minor: number;
  issued_at: string; due_at: string; paid_at: string | null;
}
interface Overview {
  status: RestaurantStatus;
  current_period: { kind: "trial" | "paid"; plan_key: string; starts_at: string; ends_at: string; extra_branches: number } | null;
  next_period: { starts_at: string; plan_key: string } | null;
  effective_plan_key: string | null;
  branch_limit: number | null;
  branches_in_use: number;
  renewal_window_days: number;
  bank_transfer_instructions: string;
  pricing: PublicPricing;
  invoices: Invoice[];
}

export default async function BillingPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const ctx = await requireUser();
  if (!ctx.active_memberships?.some((m) => m.restaurant_id === restaurantId)) notFound();
  const { locale, t } = await getDictionary();
  const supabase = await createClient();
  const [{ data, error }, { data: pack }, { data: credits }] = await Promise.all([
    supabase.rpc("restaurant_billing_overview", { p_restaurant_id: restaurantId }),
    supabase.rpc("ai_credit_pack_info"),
    supabase.rpc("ai_credit_balance", { p_restaurant_id: restaurantId }),
  ]);
  if (error) notFound(); // billing.manage only (owners)
  const packInfo = pack as { size: number; amount_minor: number | null; currency: string } | null;
  const o = data as unknown as Overview;
  const b = t.billing;
  const money = (minor: number, currency = o.pricing.currency) => formatMoney(minor, currency, locale);
  const open = o.invoices.find((i) => i.status === "open");
  const cur = o.current_period;
  const paidActive = cur?.kind === "paid";
  const inRenewalWindow = paidActive && isWithinDays(cur.ends_at, o.renewal_window_days);
  const canChoose = !o.next_period && (!paidActive || inRenewalWindow) && o.status !== "deleted";
  const planName = (key: string | null) => o.pricing.plans.find((p) => p.key === key)?.name ?? "—";

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{b.title}</h1>

      <Card data-testid="billing-status">
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div><div className="text-sm text-muted-foreground">{b.status}</div><Badge tone={o.status === "active" || o.status === "trial" ? "success" : "danger"}>{b.lifecycle[o.status]}</Badge></div>
          <div>
            <div className="text-sm text-muted-foreground">{b.plan}</div>
            <div className="font-medium">{planName(o.effective_plan_key)}</div>
            {cur ? <div className="text-sm text-muted-foreground">{fmt(cur.kind === "trial" ? b.trialUntil : b.activeUntil, { date: formatDate(cur.ends_at, locale) })}</div> : null}
            {o.next_period ? <div className="text-sm text-muted-foreground">{fmt(b.nextPeriod, { plan: planName(o.next_period.plan_key), date: formatDate(o.next_period.starts_at, locale) })}</div> : null}
          </div>
          <div>
            <div className="text-sm text-muted-foreground">{b.branches}</div>
            <div className="font-medium">{fmt(b.branchesUsage, { used: o.branches_in_use, limit: o.branch_limit ?? t.marketing.unlimited })}</div>
          </div>
        </CardContent>
      </Card>

      {open ? (
        <Card className="border-warning" data-testid="open-invoice">
          <CardHeader>
            <CardTitle as="h2" className="text-base">{b.openInvoice}: {open.number}</CardTitle>
            <CardDescription>{fmt(b.due, { date: formatDate(open.due_at, locale) })}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <ul className="grid gap-1 text-sm">
              {open.lines.map((l) => (
                <li key={l.description} className="flex justify-between gap-2"><span>{l.quantity} × {l.description}</span><span>{money(l.amount_minor, open.currency)}</span></li>
              ))}
              <li className="flex justify-between gap-2 border-t pt-1"><span>{b.subtotal}</span><span>{money(open.subtotal_minor, open.currency)}</span></li>
              <li className="flex justify-between gap-2"><span>{open.tax_label} ({open.tax_rate_bp / 100}%)</span><span>{money(open.tax_minor, open.currency)}</span></li>
              <li className="flex justify-between gap-2 font-semibold"><span>{b.total}</span><span>{money(open.total_minor, open.currency)}</span></li>
            </ul>
            <Alert><strong>{b.howToPay}:</strong> {o.bank_transfer_instructions} ({open.number})</Alert>
          </CardContent>
        </Card>
      ) : null}

      {canChoose ? (
        <section className="grid gap-3">
          <div>
            <h2 className="text-lg font-semibold">{paidActive ? b.renew : b.choosePlan}</h2>
            <p className="text-sm text-muted-foreground">{b.choosePlanBody}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {o.pricing.plans.map((plan) => {
              const limited = plan.entitlements.branches_included?.limit != null;
              return (
                <Card key={plan.key} data-testid={`choose-${plan.key}`}>
                  <CardHeader>
                    <CardTitle as="h2" className="text-base">{plan.name} · {money(plan.amount_minor)} {t.marketing.perYear}</CardTitle>
                    <CardDescription>{plan.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ActionForm action={choosePlan}>
                      <input type="hidden" name="restaurant_id" value={restaurantId} />
                      <input type="hidden" name="plan_key" value={plan.key} />
                      {limited ? (
                        <Field id={`extra-${plan.key}`} label={b.extraBranches}
                               hint={fmt(t.marketing.extraBranch, { amount: money(o.pricing.extra_branch_amount_minor) })}>
                          <Input name="extra_branches" type="number" min={0} max={50} defaultValue={Math.max(0, o.branches_in_use - 1)} />
                        </Field>
                      ) : null}
                      <SubmitButton block>{b.createInvoice}</SubmitButton>
                    </ActionForm>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}

      {paidActive && o.branch_limit != null ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle as="h2" className="text-base">{b.addBranches}</CardTitle><CardDescription>{b.addBranchesBody}</CardDescription></CardHeader>
            <CardContent>
              <ActionForm action={buyExtraBranches}>
                <input type="hidden" name="restaurant_id" value={restaurantId} />
                <Field id="branch-count" label={b.extraBranches}><Input name="count" type="number" min={1} max={50} defaultValue={1} /></Field>
                <SubmitButton>{b.createInvoice}</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle as="h2" className="text-base">{b.upgrade}</CardTitle><CardDescription>{b.upgradeBody}</CardDescription></CardHeader>
            <CardContent>
              <ActionForm action={upgradePlan}>
                <input type="hidden" name="restaurant_id" value={restaurantId} />
                <SubmitButton>{b.createInvoice}</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {packInfo?.amount_minor ? (
        <Card id="ai-credits" data-testid="ai-credits-card">
          <CardHeader>
            <CardTitle as="h2" className="text-base">{t.ai.buyCredits}</CardTitle>
            <CardDescription>
              {fmt(t.ai.credits, { n: credits ?? 0 })} · {fmt(t.ai.buyCreditsBody, { size: packInfo.size, price: money(packInfo.amount_minor, packInfo.currency) })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={buyCredits} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="restaurant_id" value={restaurantId} />
              <Field id="packs" label={t.ai.packs}><Input name="packs" type="number" min={1} max={50} defaultValue={1} className="w-24" /></Field>
              <SubmitButton>{b.createInvoice}</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle as="h2" className="text-base">{b.history}</CardTitle></CardHeader>
        <CardContent>
          {o.invoices.length === 0 ? <p className="text-sm text-muted-foreground">{b.noInvoices}</p> : null}
          <ul className="grid gap-2 text-sm">
            {o.invoices.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2" data-testid="invoice-row">
                <span className="font-medium" dir="ltr">{i.number}</span>
                {i.kind === "ai_credits" ? <span className="text-muted-foreground">{t.ai.creditsInvoice}</span>
                  : i.kind === "template" ? <span className="text-muted-foreground">{t.website.templates}</span> : null}
                <span className="text-muted-foreground">{formatDate(i.issued_at, locale)}</span>
                <span>{money(i.total_minor, i.currency)}</span>
                <Badge tone={i.status === "paid" ? "success" : i.status === "open" ? "warning" : "neutral"}>{b.invoiceStatus[i.status]}</Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
