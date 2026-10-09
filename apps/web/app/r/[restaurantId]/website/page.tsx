import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Label } from "@gomenu/ui";
import { notFound } from "next/navigation";
import { addDomain, buyTemplate, changeSlug, checkDomain, chooseTemplate, makePrimaryDomain, removeDomain, saveWebsite } from "@/app/actions/website";
import { ActionForm } from "@/components/action-form";
import { RowAction } from "@/components/row-action";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth/context";
import type { DnsRecord } from "@/lib/domains/provider";
import { syncStaleDomains } from "@/lib/domains/sync";
import { formatMoney } from "@/lib/format";
import { fmt, getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Website" };

export default async function WebsitePage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const ctx = await requireUser();
  if (!ctx.active_memberships?.some((m) => m.restaurant_id === restaurantId)) notFound();
  const { locale, t } = await getDictionary();
  const supabase = await createClient();
  const [{ data: perms }, { data: r }, { data: w }, { data: langs }, { data: ent }, { data: tpl }] = await Promise.all([
    supabase.rpc("my_permissions", { p_restaurant_id: restaurantId }),
    supabase.from("restaurants").select("slug").eq("id", restaurantId).single(),
    supabase.from("website_settings").select("*").eq("restaurant_id", restaurantId).single(),
    supabase.from("restaurant_languages").select("locale, platform_languages(name, dir)").eq("restaurant_id", restaurantId).order("sort"),
    supabase.rpc("restaurant_entitlements", { p_restaurant_id: restaurantId }),
    supabase.rpc("list_templates", { p_restaurant_id: restaurantId }),
  ]);
  type Template = { key: string; name: Record<string, string>; description: Record<string, string>; tier: "free" | "gold" | "paid";
    price_minor: number | null; currency: string; usable: boolean; purchase_status: "pending" | "paid" | null };
  const templates = (tpl ?? []) as unknown as Template[];
  const canBuy = (perms ?? []).includes("billing.manage");
  if (!r || !w || !(perms ?? []).includes("website.manage")) notFound();
  const domainsIncluded = (ent as { features?: Record<string, { enabled: boolean }> } | null)?.features?.custom_domain?.enabled ?? false;

  // Pending domains are re-checked when the page is viewed (at most once a minute); a daily cron covers the rest.
  let { data: domains } = await supabase.from("restaurant_domains").select("*").eq("restaurant_id", restaurantId).order("created_at");
  if (await syncStaleDomains(domains ?? [])) {
    ({ data: domains } = await supabase.from("restaurant_domains").select("*").eq("restaurant_id", restaurantId).order("created_at"));
  }

  const locales = (langs ?? []).map((l) => ({
    code: l.locale,
    name: (l.platform_languages as { name: string } | null)?.name ?? l.locale,
    dir: (l.platform_languages as { dir: string } | null)?.dir ?? "ltr",
  }));
  const toggle = (name: keyof typeof w, label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={Boolean(w[name])} /> {label}
    </label>
  );

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t.website.title}</h1>

      <div className="flex flex-wrap items-center gap-2">
        {w.is_published ? (
          <a href={`/${r.slug}`} target="_blank" rel="noopener" className="rounded-md border px-3 py-2 text-sm hover:bg-muted" data-testid="view-site">{t.website.viewSite}</a>
        ) : <span className="text-sm text-muted-foreground">{t.website.notPublished}</span>}
        <a href={`/preview/${restaurantId}`} target="_blank" rel="noopener" className="rounded-md border px-3 py-2 text-sm hover:bg-muted">{t.website.previewSite}</a>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">{t.website.templates}</CardTitle>
          <CardDescription>{t.website.templatesBody}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((tp) => {
              const current = w.template_key === tp.key;
              return (
                <li key={tp.key} className={`grid gap-2 rounded-lg border p-3 ${current ? "border-accent ring-1 ring-accent" : ""}`} data-testid={`template-${tp.key}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{tp.name[locale] ?? tp.name.en}</span>
                    <Badge tone={tp.tier === "free" ? "neutral" : tp.tier === "gold" ? "warning" : "accent"}>
                      {tp.tier === "free" ? t.website.tierFree : tp.tier === "gold" ? t.website.tierGold : t.website.tierPaid}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{tp.description[locale] ?? tp.description.en}</p>
                  <div className="flex flex-wrap items-center gap-1">
                    <a href={`/preview/${restaurantId}?template=${tp.key}`} target="_blank" rel="noopener"
                       className="rounded-md px-2 py-1 text-sm underline">{t.website.preview}</a>
                    {current ? <Badge tone="success">{t.website.current}</Badge>
                      : tp.usable ? <RowAction action={chooseTemplate} fields={{ restaurant_id: restaurantId, template: tp.key }} label={t.website.use} variant="outline" testId="use-template" />
                      : tp.purchase_status === "pending" ? <Badge tone="warning">{t.website.pendingPayment}</Badge>
                      : tp.tier === "paid" && canBuy && tp.price_minor != null
                        ? <RowAction action={buyTemplate} fields={{ restaurant_id: restaurantId, template: tp.key }} variant="outline" testId="buy-template"
                                     label={fmt(t.website.buy, { price: formatMoney(tp.price_minor, tp.currency, locale) })} />
                      : tp.tier === "gold" ? <span className="text-xs text-muted-foreground">{t.website.needsGold}</span> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">{t.website.slug}</CardTitle>
          <CardDescription>{t.website.slugHint}</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={changeSlug} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="restaurant_id" value={restaurantId} />
            <Field id="slug" label={<span dir="ltr">gomenu.om/</span>}>
              <Input name="slug" defaultValue={r.slug} dir="ltr" className="w-64" />
            </Field>
            <SubmitButton size="sm">{t.website.changeSlug}</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle as="h2" className="text-base">{t.website.appearance}</CardTitle></CardHeader>
        <CardContent>
          <ActionForm action={saveWebsite}>
            <input type="hidden" name="restaurant_id" value={restaurantId} />
            <div className="grid gap-2 sm:w-64">
              <Label htmlFor="menu_style">{t.website.menuStyle}</Label>
              <select id="menu_style" name="menu_style" defaultValue={w.menu_style} className="h-11 rounded-md border border-input bg-background px-3">
                {(["list", "grid", "compact"] as const).map((k) => <option key={k} value={k}>{t.website.styles[k]}</option>)}
              </select>
            </div>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">{t.website.sections}</legend>
              {toggle("show_gallery", t.website.showGallery)}
              {toggle("show_branches", t.website.showBranches)}
              {toggle("show_hours", t.website.showHours)}
              {toggle("show_whatsapp", t.website.showWhatsapp)}
            </fieldset>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">{t.website.ordering}</legend>
              {toggle("ordering_enabled", t.website.orderingEnabled)}
              {toggle("online_payment_enabled", t.website.paymentEnabled)}
              <p className="text-sm text-muted-foreground">{t.website.orderingNote}</p>
            </fieldset>
            <fieldset className="grid gap-4">
              <legend className="text-sm font-medium">{t.website.seo}</legend>
              {locales.map((l) => (
                <div key={l.code} className="grid gap-4 sm:grid-cols-2">
                  <Field id={`seo-title-${l.code}`} label={fmt(t.website.seoTitle, { lang: l.name })}>
                    <Input name={`seo_title:${l.code}`} dir={l.dir} defaultValue={(w.seo_title as Record<string, string>)[l.code] ?? ""} />
                  </Field>
                  <Field id={`seo-description-${l.code}`} label={fmt(t.website.seoDescription, { lang: l.name })}>
                    <Input name={`seo_description:${l.code}`} dir={l.dir} defaultValue={(w.seo_description as Record<string, string>)[l.code] ?? ""} />
                  </Field>
                </div>
              ))}
            </fieldset>
            {toggle("is_published", t.website.published)}
            <div><SubmitButton>{t.common.save}</SubmitButton></div>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">{t.website.domains}</CardTitle>
          <CardDescription>{domainsIncluded ? t.website.domainsBody : t.website.domainsNotIncluded}</CardDescription>
        </CardHeader>
        {domainsIncluded ? (
          <CardContent className="grid gap-4">
            {(domains ?? []).map((d) => {
              const records = (d.verification ?? []) as DnsRecord[];
              const fields = { restaurant_id: restaurantId, id: d.id };
              return (
                <div key={d.id} className="grid gap-2 rounded-md border p-3" data-testid="domain-row">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium" dir="ltr">{d.hostname}</span>
                    <span className="flex items-center gap-2">
                      {d.is_primary ? <Badge tone="accent">{t.website.primary}</Badge> : null}
                      <Badge tone={d.status === "active" ? "success" : d.status === "error" ? "danger" : "warning"} data-testid="domain-status">
                        {t.website.domainStatus[d.status]}
                      </Badge>
                    </span>
                  </div>
                  {d.error ? <p className="text-sm text-destructive">{d.error}</p> : null}
                  {d.status !== "active" && records.length ? (
                    <div className="overflow-x-auto">
                      <p className="text-sm font-medium">{t.website.dnsRecords}</p>
                      <table className="text-sm" dir="ltr">
                        <thead><tr className="text-start text-muted-foreground">
                          <th className="pe-4 text-start font-normal">{t.website.recordType}</th>
                          <th className="pe-4 text-start font-normal">{t.website.recordName}</th>
                          <th className="text-start font-normal">{t.website.recordValue}</th>
                        </tr></thead>
                        <tbody>
                          {records.map((rec, i) => (
                            <tr key={i}><td className="pe-4">{rec.type}</td><td className="pe-4">{rec.name}</td><td className="break-all font-mono">{rec.value}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-1">
                    <RowAction action={checkDomain} fields={fields} label={t.website.check} variant="outline" testId="domain-check" />
                    {d.status === "active" && !d.is_primary ? (
                      <RowAction action={makePrimaryDomain} fields={fields} label={t.website.makePrimary} testId="domain-primary" />
                    ) : null}
                    <RowAction action={removeDomain} fields={fields} label={t.website.removeDomain} />
                  </div>
                </div>
              );
            })}
            <ActionForm action={addDomain} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="restaurant_id" value={restaurantId} />
              <Field id="hostname" label={t.website.hostname}>
                <Input name="hostname" dir="ltr" placeholder="www.myrestaurant.com" className="w-72" />
              </Field>
              <SubmitButton size="sm">{t.website.addDomain}</SubmitButton>
            </ActionForm>
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
