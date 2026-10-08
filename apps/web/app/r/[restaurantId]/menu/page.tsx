import { Alert, Badge, Button, Card, CardContent, CardHeader, Field, Input } from "@gomenu/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { archiveRow, createCategory, createItem, moveRow, saveCategory, toggleAvailable } from "@/app/actions/menu";
import { ActionForm } from "@/components/action-form";
import { RowAction } from "@/components/row-action";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth/context";
import { formatMoney } from "@/lib/format";
import { fmt, getDictionary } from "@/lib/i18n";
import { tx, unreviewed } from "@/lib/i18n/text";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Menu" };

export default async function MenuPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const ctx = await requireUser();
  if (!ctx.active_memberships?.some((m) => m.restaurant_id === restaurantId)) notFound();
  const { locale, t } = await getDictionary();
  const supabase = await createClient();
  const [{ data: perms }, { data: r }, { data: langs }, { data: categories }, { data: items }] = await Promise.all([
    supabase.rpc("my_permissions", { p_restaurant_id: restaurantId }),
    supabase.from("restaurants").select("currency, default_locale").eq("id", restaurantId).single(),
    supabase.from("restaurant_languages").select("locale, platform_languages(name, dir)").eq("restaurant_id", restaurantId).order("sort"),
    supabase.from("menu_categories").select("id, name, is_active").eq("restaurant_id", restaurantId).is("archived_at", null)
      .order("sort").order("created_at"),
    supabase.from("menu_items").select("id, category_id, name, price_minor, is_available, is_active, i18n_meta")
      .eq("restaurant_id", restaurantId).is("archived_at", null).order("sort").order("created_at"),
  ]);
  const can = (p: string) => (perms ?? []).includes(p);
  if (!r || !can("menu.view")) notFound();
  const canEdit = can("menu.edit");
  const fallback = r.default_locale;
  const locales = (langs ?? []).map((l) => ({
    code: l.locale,
    name: (l.platform_languages as { name: string } | null)?.name ?? l.locale,
    dir: (l.platform_languages as { dir: string } | null)?.dir ?? "ltr",
  }));
  const nameFields = (prefix: string, label: string, idPrefix: string, values?: unknown) =>
    locales.map((l) => (
      <Field key={l.code} id={`${idPrefix}-${l.code}`} label={fmt(label, { lang: l.name })}>
        <Input name={`${prefix}:${l.code}`} dir={l.dir} defaultValue={(values as Record<string, string> | undefined)?.[l.code] ?? ""}
               required={l.code === fallback} />
      </Field>
    ));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t.menu.title}</h1>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm"><Link href={`/r/${restaurantId}/menu/import`}>{t.ai.importTitle}</Link></Button>
            <Button asChild variant="outline" size="sm"><Link href={`/r/${restaurantId}/menu/translations`}>{t.menu.translations}</Link></Button>
          </div>
        ) : null}
      </div>
      {!canEdit ? <Alert tone="info">{t.menu.readOnly}</Alert> : null}
      {!categories?.length ? <p className="text-muted-foreground" data-testid="menu-empty">{t.menu.empty}</p> : null}

      {(categories ?? []).map((c, ci) => {
        const catItems = (items ?? []).filter((i) => i.category_id === c.id);
        return (
          <Card key={c.id} data-testid="menu-category">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">
                {tx(c.name, locale, fallback)}
                {!c.is_active ? <Badge className="ms-2">{t.menu.hidden}</Badge> : null}
              </h2>
              {canEdit ? (
                <div className="flex flex-wrap items-center gap-1">
                  {ci > 0 ? <RowAction action={moveRow} fields={{ restaurant_id: restaurantId, table: "menu_categories", id: c.id, dir: "up" }} label="↑" ariaLabel={t.menu.moveUp} /> : null}
                  {ci < (categories ?? []).length - 1 ? <RowAction action={moveRow} fields={{ restaurant_id: restaurantId, table: "menu_categories", id: c.id, dir: "down" }} label="↓" ariaLabel={t.menu.moveDown} /> : null}
                </div>
              ) : null}
            </CardHeader>
            <CardContent className="grid gap-3">
              <ul className="divide-y">
                {catItems.map((item, ii) => (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid="menu-item">
                    <div className="grid">
                      <span className="font-medium">
                        {canEdit ? <Link className="hover:underline" href={`/r/${restaurantId}/menu/items/${item.id}`}>{tx(item.name, locale, fallback)}</Link> : tx(item.name, locale, fallback)}
                      </span>
                      <span className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                        {formatMoney(item.price_minor, r.currency, locale)}
                        {!item.is_available ? <Badge tone="warning">{t.menu.soldOut}</Badge> : null}
                        {!item.is_active ? <Badge>{t.menu.hidden}</Badge> : null}
                        {unreviewed(item.i18n_meta).length ? <Badge tone="accent">{t.menu.aiDraft}</Badge> : null}
                      </span>
                    </div>
                    {canEdit ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <RowAction action={toggleAvailable} testId="toggle-available"
                                   fields={{ restaurant_id: restaurantId, id: item.id, available: String(!item.is_available) }}
                                   label={item.is_available ? t.menu.markSoldOut : t.menu.markAvailable} variant="outline" />
                        {ii > 0 ? <RowAction action={moveRow} fields={{ restaurant_id: restaurantId, table: "menu_items", id: item.id, dir: "up" }} label="↑" ariaLabel={t.menu.moveUp} /> : null}
                        {ii < catItems.length - 1 ? <RowAction action={moveRow} fields={{ restaurant_id: restaurantId, table: "menu_items", id: item.id, dir: "down" }} label="↓" ariaLabel={t.menu.moveDown} /> : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>

              {canEdit ? (
                <>
                  <details>
                    <summary className="cursor-pointer text-sm font-medium" data-testid="add-item-toggle">{t.menu.addItem}</summary>
                    <ActionForm action={createItem} className="mt-3">
                      <input type="hidden" name="restaurant_id" value={restaurantId} />
                      <input type="hidden" name="category_id" value={c.id} />
                      <div className="grid gap-4 sm:grid-cols-2">
                        {nameFields("name", t.menu.itemName, `new-item-${c.id}`)}
                        <Field id={`new-price-${c.id}`} label={fmt(t.menu.price, { currency: r.currency })}>
                          <Input name="price" inputMode="decimal" dir="ltr" required />
                        </Field>
                      </div>
                      <SubmitButton size="sm">{t.menu.addItem}</SubmitButton>
                    </ActionForm>
                  </details>
                  <details>
                    <summary className="cursor-pointer text-sm font-medium">{t.menu.edit}</summary>
                    <ActionForm action={saveCategory} className="mt-3">
                      <input type="hidden" name="restaurant_id" value={restaurantId} />
                      <input type="hidden" name="id" value={c.id} />
                      <div className="grid gap-4 sm:grid-cols-2">{nameFields("name", t.menu.categoryName, `cat-${c.id}`, c.name)}</div>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="is_active" defaultChecked={c.is_active} /> {t.menu.categoryVisible}
                      </label>
                      <SubmitButton size="sm">{t.menu.saveCategory}</SubmitButton>
                    </ActionForm>
                    <div className="mt-2">
                      <RowAction action={archiveRow} fields={{ restaurant_id: restaurantId, table: "menu_categories", id: c.id }} label={t.menu.archiveCategory} />
                    </div>
                  </details>
                </>
              ) : null}
            </CardContent>
          </Card>
        );
      })}

      {canEdit ? (
        <Card>
          <CardHeader><h2 className="text-base font-semibold">{t.menu.addCategory}</h2></CardHeader>
          <CardContent>
            <ActionForm action={createCategory}>
              <input type="hidden" name="restaurant_id" value={restaurantId} />
              <div className="grid gap-4 sm:grid-cols-2">{nameFields("name", t.menu.categoryName, "new-cat")}</div>
              <SubmitButton size="sm">{t.menu.addCategory}</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
