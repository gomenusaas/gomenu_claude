import { PricingCards } from "@/components/pricing-cards";
import { fmt, getDictionary } from "@/lib/i18n";
import { getPublicPricing } from "@/lib/pricing";

export const metadata = { title: "Pricing" };

export default async function PricingPage() {
  const { locale, t } = await getDictionary();
  const pricing = await getPublicPricing();
  return (
    <section className="mx-auto grid max-w-5xl gap-8 px-4 py-12">
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold">{t.marketing.pricingTitle}</h1>
        <p className="text-muted-foreground">{fmt(t.marketing.pricingBody, { months: pricing.trial_months })}</p>
      </div>
      <PricingCards pricing={pricing} t={t} locale={locale} showAll />
    </section>
  );
}
