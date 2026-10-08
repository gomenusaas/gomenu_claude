import { Card, CardContent } from "@gomenu/ui";
import { getDictionary } from "@/lib/i18n";
import { getPublicPricing } from "@/lib/pricing";

export const metadata = { title: "Features" };

export default async function FeaturesPage() {
  const { t } = await getDictionary();
  const pricing = await getPublicPricing();
  const m = t.marketing;
  const gold = pricing.plans.find((p) => p.key === "gold");
  const silver = pricing.plans.find((p) => p.key === "silver");
  const featureLabel = (key: string) => (t.features as Record<string, string>)[key] ?? key;
  return (
    <section className="mx-auto grid max-w-6xl gap-8 px-4 py-12">
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold">{m.featuresTitle}</h1>
        <p className="text-muted-foreground">{m.featuresBody}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(m.highlights).map(([key, h]) => (
          <Card key={key}><CardContent className="grid gap-2"><h2 className="font-semibold">{h.title}</h2><p className="text-sm text-muted-foreground">{h.body}</p></CardContent></Card>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr><th className="p-3 text-start font-medium"> </th><th className="p-3 text-center font-medium">{silver?.name}</th><th className="p-3 text-center font-medium">{gold?.name}</th></tr>
          </thead>
          <tbody>
            {pricing.features.map((f) => (
              <tr key={f.key} className="border-t">
                <td className="p-3">{featureLabel(f.key)}</td>
                {[silver, gold].map((plan) => {
                  const e = plan?.entitlements[f.key];
                  const value = f.kind === "limit" ? (e?.enabled ? (e.limit == null ? m.unlimited : String(e.limit)) : "—") : e?.enabled ? "✓" : "—";
                  return <td key={plan?.key} className="p-3 text-center">{value}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
