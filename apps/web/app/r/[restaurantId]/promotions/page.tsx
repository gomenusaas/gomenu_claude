import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Label } from "@gomenu/ui";
import { notFound } from "next/navigation";
import { archivePromotion, savePromotion, setPromotionActive, setPromotionImage } from "@/app/actions/promotions";
import { ActionForm } from "@/components/action-form";
import { MediaUpload } from "@/components/media-upload";
import { RowAction } from "@/components/row-action";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth/context";
import { isoToZonedLocal } from "@/lib/format";
import { fmt, getDictionary } from "@/lib/i18n";
import { tx } from "@/lib/i18n/text";
import { publicMediaUrl } from "@/lib/media/url";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Promotions" };

const selectClass = "h-11 rounded-md border border-input bg-background px-3";

type Promo = {
  id: string; kind: "card" | "banner" | "carousel"; title: Record<string, string>; body: Record<string, string>;
  image_path: string | null; item_id: string | null; starts_at: string; ends_at: string | null; is_active: boolean;
  promotion_branches: { branch_id: string }[];
};

export default async function PromotionsPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const ctx = await requireUser();
  if (!ctx.active_memberships?.some((m) => m.restaurant_id === restaurantId)) notFound();
  const { locale, t } = await getDictionary();
  const supabase = await createClient();
  const [{ data: perms }, { data: r }, { data: langs }, { data: promos }, { data: items }, { data: branches }, { data: ent }] = await Promise.all([
    supabase.rpc("my_permissions", { p_restaurant_id: restaurantId }),
    supabase.from("restaurants").select("timezone, default_locale").eq("id", restaurantId).single(),
    supabase.from("restaurant_languages").select("locale, platform_languages(name, dir)").eq("restaurant_id", restaurantId).order("sort"),
    supabase.from("promotions").select("*, promotion_branches(branch_id)").eq("restaurant_id", restaurantId).is("archived_at", null)
      .order("sort").order("created_at", { ascending: false }),
    supabase.from("menu_items").select("id, name").eq("restaurant_id", restaurantId).is("archived_at", null).order("sort"),
    supabase.from("branches").select("id, name").eq("restaurant_id", restaurantId).is("archived_at", null).order("sort"),
    supabase.rpc("restaurant_entitlements", { p_restaurant_id: restaurantId }),
  ]);
  const can = (p: string) => (perms ?? []).includes(p);
  if (!r || !can("promotions.manage")) notFound();
  const included = (ent as { features?: Record<string, { enabled: boolean }> } | null)?.features?.promotions?.enabled ?? false;
  const tz = r.timezone;
  const locales = (langs ?? []).map((l) => ({
    code: l.locale, name: (l.platform_languages as { name: string } | null)?.name ?? l.locale,
    dir: (l.platform_languages as { dir: string } | null)?.dir ?? "ltr",
  }));
  // Basic counts now; full promotion analytics arrive with the reports phase.
  const counts = new Map<string, { views: number; clicks: number }>();
  if (can("analytics.view") && promos?.length) {
    const { data: events } = await supabase.from("analytics_events").select("entity_id, event_type")
      .eq("restaurant_id", restaurantId).eq("is_internal", false).in("event_type", ["promotion_view", "promotion_click"])
      .in("entity_id", promos.map((p) => p.id));
    for (const e of events ?? []) {
      const c = counts.get(e.entity_id!) ?? { views: 0, clicks: 0 };
      if (e.event_type === "promotion_view") c.views++; else c.clicks++;
      counts.set(e.entity_id!, c);
    }
  }
  const now = new Date().toISOString();
  const status = (p: Promo) => !p.is_active ? t.promotions.inactive : p.starts_at > now ? t.promotions.scheduled
    : p.ends_at && p.ends_at <= now ? t.promotions.ended : t.promotions.active;

  const form = (p?: Promo) => (
    <ActionForm action={savePromotion}>
      <input type="hidden" name="restaurant_id" value={restaurantId} />
      {p ? <input type="hidden" name="id" value={p.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {locales.map((l) => (
          <Field key={`t-${l.code}`} id={`title-${p?.id ?? "new"}-${l.code}`} label={fmt(t.promotions.titleField, { lang: l.name })}>
            <Input name={`title:${l.code}`} dir={l.dir} defaultValue={p?.title[l.code] ?? ""} required={l.code === r.default_locale} />
          </Field>
        ))}
        {locales.map((l) => (
          <Field key={`b-${l.code}`} id={`body-${p?.id ?? "new"}-${l.code}`} label={fmt(t.promotions.bodyField, { lang: l.name })}>
            <Input name={`body:${l.code}`} dir={l.dir} defaultValue={p?.body[l.code] ?? ""} />
          </Field>
        ))}
        <div className="grid gap-2">
          <Label htmlFor={`kind-${p?.id ?? "new"}`}>{t.promotions.kind}</Label>
          <select id={`kind-${p?.id ?? "new"}`} name="kind" defaultValue={p?.kind ?? "card"} className={selectClass}>
            {(["card", "banner", "carousel"] as const).map((k) => <option key={k} value={k}>{t.promotions.kinds[k]}</option>)}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`item-${p?.id ?? "new"}`}>{t.promotions.item}</Label>
          <select id={`item-${p?.id ?? "new"}`} name="item_id" defaultValue={p?.item_id ?? ""} className={selectClass}>
            <option value="">{t.promotions.noItem}</option>
            {(items ?? []).map((i) => <option key={i.id} value={i.id}>{tx(i.name, locale, r.default_locale)}</option>)}
          </select>
        </div>
        <Field id={`starts-${p?.id ?? "new"}`} label={t.promotions.starts}>
          <Input name="starts_at" type="datetime-local" defaultValue={p ? isoToZonedLocal(p.starts_at, tz) : ""} />
        </Field>
        <Field id={`ends-${p?.id ?? "new"}`} label={t.promotions.ends}>
          <Input name="ends_at" type="datetime-local" defaultValue={p?.ends_at ? isoToZonedLocal(p.ends_at, tz) : ""} />
        </Field>
      </div>
      {(branches ?? []).length > 1 ? (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">{t.promotions.branches}</legend>
          <div className="flex flex-wrap gap-4">
            {(branches ?? []).map((b) => (
              <label key={b.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="branches" value={b.id} defaultChecked={p?.promotion_branches.some((x) => x.branch_id === b.id)} /> {b.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div><SubmitButton size="sm">{p ? t.common.save : t.promotions.add}</SubmitButton></div>
    </ActionForm>
  );

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.promotions.title}</h1>
        <p className="text-muted-foreground">{t.promotions.body}</p>
      </div>
      {!included ? (
        <Card><CardContent className="pt-6"><CardDescription>{t.promotions.notIncluded}</CardDescription></CardContent></Card>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle as="h2" className="text-base">{t.promotions.add}</CardTitle></CardHeader>
            <CardContent>{form()}</CardContent>
          </Card>
          {!(promos ?? []).length ? <p className="text-sm text-muted-foreground">{t.promotions.empty}</p> : null}
          {((promos ?? []) as unknown as Promo[]).map((p) => (
            <Card key={p.id} data-testid="promotion-row">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle as="h2" className="text-base">{tx(p.title, locale, r.default_locale)}</CardTitle>
                <span className="flex items-center gap-2">
                  {counts.get(p.id) ? <span className="text-xs text-muted-foreground">
                    {fmt(t.promotions.views, { n: counts.get(p.id)!.views })} · {fmt(t.promotions.clicks, { n: counts.get(p.id)!.clicks })}</span> : null}
                  <Badge tone={status(p) === t.promotions.active ? "success" : "neutral"} data-testid="promotion-status">{status(p)}</Badge>
                </span>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  {p.image_path ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={publicMediaUrl(p.image_path) ?? ""} alt="" className="h-20 w-32 rounded-md object-cover" />
                  ) : null}
                  <MediaUpload restaurantId={restaurantId} folder="promotions" allowVideo={false}
                               save={setPromotionImage.bind(null, restaurantId, p.id)} testId="promotion-image"
                               labels={{ upload: t.promotions.image, uploading: t.menu.uploading, videoTooLarge: t.menu.videoTooLarge }} />
                </div>
                <details>
                  <summary className="cursor-pointer text-sm font-medium">{t.menu.edit}</summary>
                  <div className="mt-3">{form(p)}</div>
                </details>
                <div className="flex flex-wrap gap-2">
                  <RowAction action={setPromotionActive} fields={{ restaurant_id: restaurantId, id: p.id, active: String(!p.is_active) }}
                             label={p.is_active ? t.promotions.hide : t.promotions.show} variant="outline" />
                  <RowAction action={archivePromotion} fields={{ restaurant_id: restaurantId, id: p.id }} label={t.promotions.archive} />
                </div>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
