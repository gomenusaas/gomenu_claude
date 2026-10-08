import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from "@gomenu/ui";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { fmt } from "@/lib/i18n";
import type { Dictionary } from "@/lib/i18n/en";
import type { PublicPricing } from "@/lib/pricing";

/** Plan cards rendered from database pricing + entitlements. */
export function PricingCards({ pricing, t, locale, showAll = false }: {
  pricing: PublicPricing; t: Dictionary; locale: Locale; showAll?: boolean;
}) {
  const m = t.marketing;
  const featureLabel = (key: string) => (t.features as Record<string, string>)[key] ?? key;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {pricing.plans.map((plan) => {
        const featured = plan.key === "gold";
        const branches = plan.entitlements.branches_included;
        return (
          <Card key={plan.key} className={cn("flex flex-col", featured && "border-accent")} data-testid={`plan-${plan.key}`}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle as="h3" className="text-lg">{plan.name}</CardTitle>
                {featured ? <Badge tone="accent">{m.mostPopular}</Badge> : null}
              </div>
              <CardDescription>{plan.description}</CardDescription>
            </CardHeader>
            <CardContent className="grid flex-1 content-start gap-4">
              <div>
                <span className="text-3xl font-semibold">{formatMoney(plan.amount_minor, pricing.currency, locale)}</span>{" "}
                <span className="text-muted-foreground">{m.perYear}</span>
                <p className="text-sm text-muted-foreground">
                  {fmt(m.perMonthEquivalent, { amount: formatMoney(Math.round(plan.amount_minor / 12), pricing.currency, locale) })}
                </p>
              </div>
              <ul className="grid gap-2 text-sm">
                <li className="flex justify-between gap-2">
                  <span>{featureLabel("branches_included")}</span>
                  <span className="font-medium">{branches?.limit == null ? m.unlimited : branches.limit}</span>
                </li>
                {pricing.features
                  .filter((f) => f.kind === "flag")
                  .filter((f) => showAll || plan.entitlements[f.key]?.enabled)
                  .map((f) => (
                    <li key={f.key} className="flex justify-between gap-2">
                      <span className={plan.entitlements[f.key]?.enabled ? "" : "text-muted-foreground line-through"}>{featureLabel(f.key)}</span>
                      <span aria-label={plan.entitlements[f.key]?.enabled ? m.included : m.notIncluded}>
                        {plan.entitlements[f.key]?.enabled ? "✓" : "—"}
                      </span>
                    </li>
                  ))}
              </ul>
              {branches?.limit != null ? (
                <p className="text-sm text-muted-foreground">
                  {fmt(m.extraBranch, { amount: formatMoney(pricing.extra_branch_amount_minor, pricing.currency, locale) })}
                </p>
              ) : null}
              <Button asChild variant={featured ? "primary" : "outline"} block className="mt-auto">
                <Link href="/register">{m.choose}</Link>
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
