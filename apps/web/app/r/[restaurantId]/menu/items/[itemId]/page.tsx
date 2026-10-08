import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Label } from "@gomenu/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addGroup, addItemMedia, addOption, addVariant, archiveRow, markReviewed, removeMedia, saveGroup, saveItem,
  saveVariant, setBranchOverride, setCover,
} from "@/app/actions/menu";
import { ActionForm } from "@/components/action-form";
import { MediaUpload } from "@/components/media-upload";
import { RowAction } from "@/components/row-action";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth/context";
import { Constants } from "@/lib/database.types";
import { formatMoney, minorToInput } from "@/lib/format";
import { fmt, getDictionary } from "@/lib/i18n";
import { tx, unreviewed } from "@/lib/i18n/text";
import { publicMediaUrl } from "@/lib/media/url";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Edit item" };

type Feature = { enabled: boolean; limit_value: number | null };
const selectClass = "h-11 rounded-md border border-input bg-background px-3";

export default async function ItemPage({ params }: { params: Promise<{ restaurantId: string; itemId: string }> }) {
  const { restaurantId, itemId } = await params;
  const ctx = await requireUser();
  if (!ctx.active_memberships?.some((m) => m.restaurant_id === restaurantId)) notFound();
  const { locale, t } = await getDictionary();
  const supabase = await createClient();
  const [{ data: perms }, { data: r }, { data: langs }, { data: item }, { data: categories }, { data: variants },
    { data: groups }, { data: options }, { data: media }, { data: branches }, { data: overrides }, { data: ent }] =
    await Promise.all([
      supabase.rpc("my_permissions", { p_restaurant_id: restaurantId }),
      supabase.from("restaurants").select("currency, default_locale").eq("id", restaurantId).single(),
      supabase.from("restaurant_languages").select("locale, platform_languages(name, dir)").eq("restaurant_id", restaurantId).order("sort"),
      supabase.from("menu_items").select("*").eq("id", itemId).eq("restaurant_id", restaurantId).is("archived_at", null).maybeSingle(),
      supabase.from("menu_categories").select("id, name").eq("restaurant_id", restaurantId).is("archived_at", null).order("sort"),
      supabase.from("menu_item_variants").select("*").eq("item_id", itemId).is("archived_at", null).order("sort"),
      supabase.from("menu_option_groups").select("*").eq("item_id", itemId).is("archived_at", null).order("sort"),
      supabase.from("menu_options").select("*").eq("restaurant_id", restaurantId).is("archived_at", null).order("sort"),
      supabase.from("menu_item_media").select("*").eq("item_id", itemId).order("sort"),
      supabase.from("branches").select("id, name").eq("restaurant_id", restaurantId).is("archived_at", null).order("sort"),
      supabase.from("branch_menu_overrides").select("branch_id, is_hidden, is_available").eq("item_id", itemId),
      supabase.rpc("restaurant_entitlements", { p_restaurant_id: restaurantId }),
    ]);
  if (!r || !item || !(perms ?? []).includes("menu.edit")) notFound();
  const fallback = r.default_locale;
  const locales = (langs ?? []).map((l) => ({
    code: l.locale,
    name: (l.platform_languages as { name: string } | null)?.name ?? l.locale,
    dir: (l.platform_languages as { dir: string } | null)?.dir ?? "ltr",
  }));
  const features = ((ent as { features?: Record<string, Feature> } | null)?.features ?? {});
  const images = features.item_images;
  const videos = features.item_videos;
  const base = { restaurant_id: restaurantId };
  const pending = unreviewed(item.i18n_meta);
  const money = (minor: number) => formatMoney(minor, r.currency, locale);

  const i18nInputs = (prefix: string, label: string, idPrefix: string, values: unknown, required = true) =>
    locales.map((l) => (
      <Field key={l.code} id={`${idPrefix}-${l.code}`} label={fmt(label, { lang: l.name })}>
        <Input name={`${prefix}:${l.code}`} dir={l.dir} required={required && l.code === fallback}
               defaultValue={(values as Record<string, string>)?.[l.code] ?? ""} />
      </Field>
    ));

  return (
    <div className="grid gap-6">
      <div>
        <Link href={`/r/${restaurantId}/menu`} className="text-sm text-muted-foreground hover:underline">← {t.menu.back}</Link>
        <h1 className="text-2xl font-semibold">{tx(item.name, locale, fallback)}</h1>
      </div>

      <Card>
        <CardHeader><CardTitle as="h2" className="text-base">{t.menu.edit}</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          {pending.length ? (
            <div className="flex flex-wrap items-center gap-2" data-testid="ai-draft">
              {pending.map((loc) => (
                <span key={loc} className="flex items-center gap-1">
                  <Badge tone="accent">{t.menu.aiDraft} · {loc}</Badge>
                  <RowAction action={markReviewed} fields={{ ...base, entity: "menu_items", id: item.id, locale: loc }} label={t.menu.markReviewed} />
                </span>
              ))}
            </div>
          ) : null}
          <ActionForm action={saveItem}>
            <input type="hidden" name="restaurant_id" value={restaurantId} />
            <input type="hidden" name="id" value={item.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              {i18nInputs("name", t.menu.itemName, "name", item.name)}
              {i18nInputs("description", t.menu.itemDescription, "description", item.description, false)}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="category_id">{t.menu.category}</Label>
                <select id="category_id" name="category_id" defaultValue={item.category_id} className={selectClass}>
                  {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{tx(c.name, locale, fallback)}</option>)}
                </select>
              </div>
              <Field id="price" label={fmt(t.menu.price, { currency: r.currency })}>
                <Input name="price" inputMode="decimal" dir="ltr" defaultValue={minorToInput(item.price_minor, r.currency)} required />
              </Field>
              <Field id="calories" label={t.menu.calories}>
                <Input name="calories" inputMode="numeric" dir="ltr" defaultValue={item.calories ?? ""} />
              </Field>
              <div className="grid gap-2">
                <Label htmlFor="spice_level">{t.menu.spice}</Label>
                <select id="spice_level" name="spice_level" defaultValue={String(item.spice_level)} className={selectClass}>
                  {t.menu.spiceLevels.map((label, i) => <option key={i} value={i}>{label}</option>)}
                </select>
              </div>
            </div>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">{t.menu.allergens}</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {Constants.public.Enums.allergen.map((a) => (
                  <label key={a} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="allergens" value={a} defaultChecked={item.allergens.includes(a)} />
                    {t.menu.allergenNames[a]}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">{t.menu.dietary}</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {Constants.public.Enums.dietary_tag.map((d) => (
                  <label key={d} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="dietary" value={d} defaultChecked={item.dietary_tags.includes(d)} />
                    {t.menu.dietaryNames[d]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="is_available" defaultChecked={item.is_available} /> {t.menu.available}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="is_active" defaultChecked={item.is_active} /> {t.menu.visible}
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <SubmitButton>{t.common.save}</SubmitButton>
            </div>
          </ActionForm>
          <div>
            <RowAction action={archiveRow} fields={{ ...base, table: "menu_items", id: item.id }} label={t.menu.archive} variant="outline" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">{t.menu.media}</CardTitle>
          <CardDescription>
            {fmt(t.menu.mediaHint, { images: images?.enabled ? (images.limit_value ?? "∞") : 0, videos: videos?.enabled ? (videos.limit_value ?? "∞") : 0 })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(media ?? []).map((m) => (
              <div key={m.id} className="grid gap-1" data-testid="item-media">
                {m.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={publicMediaUrl(m.storage_path) ?? ""} alt="" loading="lazy" className="aspect-square w-full rounded-md border object-cover" />
                ) : (
                  <video src={publicMediaUrl(m.storage_path) ?? ""} poster={publicMediaUrl(m.poster_path) ?? undefined}
                         preload="none" controls className="aspect-square w-full rounded-md border object-cover" />
                )}
                <div className="flex flex-wrap items-center gap-1">
                  {m.is_cover ? <Badge tone="success">{t.menu.cover}</Badge> : m.kind === "image" ? (
                    <RowAction action={setCover} fields={{ ...base, item_id: item.id, id: m.id }} label={t.menu.makeCover} />
                  ) : null}
                  <RowAction action={removeMedia} fields={{ ...base, id: m.id }} label={t.menu.remove} />
                </div>
              </div>
            ))}
          </div>
          <MediaUpload restaurantId={restaurantId} folder={`menu/${item.id}`} save={addItemMedia.bind(null, restaurantId, item.id)}
                       allowVideo={Boolean(videos?.enabled)} testId="item-media-input"
                       labels={{ upload: t.menu.uploadMedia, uploading: t.menu.uploading, videoTooLarge: t.menu.videoTooLarge }} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle as="h2" className="text-base">{t.menu.variants}</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          {(variants ?? []).map((v) => (
            <ActionForm key={v.id} action={saveVariant} className="rounded-md border p-3">
              <input type="hidden" name="restaurant_id" value={restaurantId} />
              <input type="hidden" name="id" value={v.id} />
              <div className="grid gap-4 sm:grid-cols-3">
                {i18nInputs("name", t.menu.variantName, `variant-${v.id}`, v.name)}
                <Field id={`variant-price-${v.id}`} label={fmt(t.menu.price, { currency: r.currency })}>
                  <Input name="price" inputMode="decimal" dir="ltr" defaultValue={minorToInput(v.price_minor, r.currency)} />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <SubmitButton size="sm">{t.common.save}</SubmitButton>
              </div>
            </ActionForm>
          ))}
          {(variants ?? []).length ? (
            <div className="flex flex-wrap gap-2">
              {(variants ?? []).map((v) => (
                <RowAction key={v.id} action={archiveRow} fields={{ ...base, table: "menu_item_variants", id: v.id }}
                           label={`${t.menu.archive}: ${tx(v.name, locale, fallback)}`} />
              ))}
            </div>
          ) : null}
          <ActionForm action={addVariant}>
            <input type="hidden" name="restaurant_id" value={restaurantId} />
            <input type="hidden" name="item_id" value={item.id} />
            <div className="grid gap-4 sm:grid-cols-3">
              {i18nInputs("name", t.menu.variantName, "new-variant", {})}
              <Field id="new-variant-price" label={fmt(t.menu.price, { currency: r.currency })}>
                <Input name="price" inputMode="decimal" dir="ltr" />
              </Field>
            </div>
            <div><SubmitButton size="sm" variant="outline">{t.menu.addVariant}</SubmitButton></div>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">{t.menu.optionGroups}</CardTitle>
          <CardDescription>{t.menu.selectHint}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {(groups ?? []).map((g) => (
            <div key={g.id} className="grid gap-3 rounded-md border p-3" data-testid="option-group">
              <ActionForm action={saveGroup}>
                <input type="hidden" name="restaurant_id" value={restaurantId} />
                <input type="hidden" name="id" value={g.id} />
                <div className="grid gap-4 sm:grid-cols-4">
                  {i18nInputs("name", t.menu.groupName, `group-${g.id}`, g.name)}
                  <Field id={`min-${g.id}`} label={t.menu.minSelect}><Input name="min_select" type="number" min={0} defaultValue={g.min_select} /></Field>
                  <Field id={`max-${g.id}`} label={t.menu.maxSelect}><Input name="max_select" type="number" min={1} defaultValue={g.max_select ?? ""} /></Field>
                </div>
                <div className="flex flex-wrap gap-2"><SubmitButton size="sm">{t.common.save}</SubmitButton></div>
              </ActionForm>
              <ul className="grid gap-1 text-sm">
                {(options ?? []).filter((o) => o.group_id === g.id).map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2">
                    <span>{tx(o.name, locale, fallback)}{o.price_delta_minor ? ` (+${money(o.price_delta_minor)})` : ""}</span>
                    <RowAction action={archiveRow} fields={{ ...base, table: "menu_options", id: o.id }} label={t.menu.remove} />
                  </li>
                ))}
              </ul>
              <ActionForm action={addOption}>
                <input type="hidden" name="restaurant_id" value={restaurantId} />
                <input type="hidden" name="group_id" value={g.id} />
                <div className="grid gap-4 sm:grid-cols-3">
                  {i18nInputs("name", t.menu.optionName, `new-option-${g.id}`, {})}
                  <Field id={`new-option-price-${g.id}`} label={t.menu.priceDelta}><Input name="price" inputMode="decimal" dir="ltr" /></Field>
                </div>
                <div><SubmitButton size="sm" variant="outline">{t.menu.addOption}</SubmitButton></div>
              </ActionForm>
              <div><RowAction action={archiveRow} fields={{ ...base, table: "menu_option_groups", id: g.id }} label={t.menu.archive} /></div>
            </div>
          ))}
          <ActionForm action={addGroup}>
            <input type="hidden" name="restaurant_id" value={restaurantId} />
            <input type="hidden" name="item_id" value={item.id} />
            <div className="grid gap-4 sm:grid-cols-4">
              {i18nInputs("name", t.menu.groupName, "new-group", {})}
              <Field id="new-min" label={t.menu.minSelect}><Input name="min_select" type="number" min={0} defaultValue={0} /></Field>
              <Field id="new-max" label={t.menu.maxSelect}><Input name="max_select" type="number" min={1} /></Field>
            </div>
            <div><SubmitButton size="sm" variant="outline">{t.menu.addGroup}</SubmitButton></div>
          </ActionForm>
        </CardContent>
      </Card>

      {(branches ?? []).length > 1 ? (
        <Card>
          <CardHeader><CardTitle as="h2" className="text-base">{t.menu.branchAvailability}</CardTitle></CardHeader>
          <CardContent className="grid gap-2">
            {(branches ?? []).map((b) => {
              const o = (overrides ?? []).find((x) => x.branch_id === b.id);
              const state = o?.is_hidden ? "hidden" : o && !o.is_available ? "unavailable" : "default";
              return (
                <ActionForm key={b.id} action={setBranchOverride} className="flex flex-wrap items-center gap-2" quiet>
                  <input type="hidden" name="restaurant_id" value={restaurantId} />
                  <input type="hidden" name="item_id" value={item.id} />
                  <input type="hidden" name="branch_id" value={b.id} />
                  <label htmlFor={`branch-${b.id}`} className="w-40 text-sm">{b.name}</label>
                  <select id={`branch-${b.id}`} name="state" defaultValue={state} className={selectClass}>
                    <option value="default">{t.menu.branchDefault}</option>
                    <option value="unavailable">{t.menu.unavailableInBranch}</option>
                    <option value="hidden">{t.menu.hideInBranch}</option>
                  </select>
                  <SubmitButton size="sm" variant="outline">{t.common.save}</SubmitButton>
                </ActionForm>
              );
            })}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
