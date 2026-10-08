import { Button, Card, CardContent } from "@gomenu/ui";
import Link from "next/link";
import { PricingCards } from "@/components/pricing-cards";
import { getMyContext } from "@/lib/auth/context";
import { fmt, getDictionary } from "@/lib/i18n";
import { getPublicPricing } from "@/lib/pricing";

export default async function Home() {
  const { locale, t } = await getDictionary();
  const [pricing, ctx] = await Promise.all([getPublicPricing(), getMyContext()]);
  const m = t.marketing;
  return (
    <>
      <section className="bg-muted/50">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-16 sm:py-24">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">{m.heroTitle}</h1>
          <p className="max-w-2xl text-lg text-muted-foreground">{m.heroBody}</p>
          <div className="flex flex-wrap items-center gap-3">
            {ctx.authenticated ? (
              <Button asChild size="lg"><Link href="/app">{m.dashboard}</Link></Button>
            ) : (
              <Button asChild size="lg"><Link href="/register">{fmt(m.heroCta, { months: pricing.trial_months })}</Link></Button>
            )}
            <Button asChild size="lg" variant="outline"><Link href="/pricing">{m.nav.pricing}</Link></Button>
          </div>
          <p className="text-sm text-muted-foreground">{m.heroNote}</p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-16">
        <h2 className="text-2xl font-semibold">{m.highlightsTitle}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(m.highlights).map(([key, h]) => (
            <Card key={key}>
              <CardContent className="grid gap-2">
                <h3 className="font-semibold">{h.title}</h3>
                <p className="text-sm text-muted-foreground">{h.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y bg-muted/30">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-16">
          <h2 className="text-2xl font-semibold">{m.stepsTitle}</h2>
          <ol className="grid gap-4 sm:grid-cols-3">
            {m.steps.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{i + 1}</span>
                <span className="pt-1">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-16">
        <div className="grid gap-2">
          <h2 className="text-2xl font-semibold">{m.pricingTitle}</h2>
          <p className="text-muted-foreground">{fmt(m.pricingBody, { months: pricing.trial_months })}</p>
        </div>
        <PricingCards pricing={pricing} t={t} locale={locale} />
      </section>
    </>
  );
}
