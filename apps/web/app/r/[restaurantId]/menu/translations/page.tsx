import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Label } from "@gomenu/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { runTranslation } from "@/app/actions/ai";
import { markReviewed } from "@/app/actions/menu";
import { ActionForm } from "@/components/action-form";
import { RowAction } from "@/components/row-action";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth/context";
import { fmt, getDictionary } from "@/lib/i18n";
import { tx, unreviewed } from "@/lib/i18n/text";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Translations" };
export const maxDuration = 300;

const ENTITIES = ["menu_categories", "menu_items", "menu_item_variants", "menu_option_groups", "menu_options"] as const;
const selectClass = "h-11 rounded-md border border-input bg-background px-3";

export default async function TranslationsPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const ctx = await requireUser();
  if (!ctx.active_memberships?.some((m) => m.restaurant_id === restaurantId)) notFound();
  const { locale, t } = await getDictionary();
  const supabase = await createClient();
  const [{ data: perms }, { data: r }, { data: langs }, { data: balance }, ...rows] = await Promise.all([
    supabase.rpc("my_permissions", { p_restaurant_id: restaurantId }),
    supabase.from("restaurants").select("default_locale").eq("id", restaurantId).single(),
    supabase.from("restaurant_languages").select("locale, platform_languages(name)").eq("restaurant_id", restaurantId).order("sort"),
    supabase.rpc("ai_credit_balance", { p_restaurant_id: restaurantId }),
    ...ENTITIES.map((table) =>
      supabase.from(table as "menu_items").select("id, name, i18n_meta").eq("restaurant_id", restaurantId)
        .is("archived_at", null).neq("i18n_meta", "{}")),
  ]);
  if (!r || !(perms ?? []).includes("menu.edit")) notFound();
  const source = r.default_locale;
  const langName = (code: string) =>
    ((langs ?? []).find((l) => l.locale === code)?.platform_languages as { name: string } | null)?.name ?? code;
  const targets = (langs ?? []).map((l) => l.locale).filter((l) => l !== source);
  const { data: categories } = await supabase.from("menu_categories").select("id, name")
    .eq("restaurant_id", restaurantId).is("archived_at", null).order("sort");
  const drafts = ENTITIES.flatMap((entity, i) =>
    (rows[i].data ?? []).flatMap((row) => unreviewed(row.i18n_meta).map((loc) => ({ entity, row, loc }))));

  return (
    <div className="grid gap-6">
      <div>
        <Link href={`/r/${restaurantId}/menu`} className="text-sm text-muted-foreground hover:underline">← {t.menu.back}</Link>
        <h1 className="text-2xl font-semibold">{t.menu.translations}</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">{t.ai.translateTitle}</CardTitle>
          <CardDescription>{t.ai.translateBody} {fmt(t.ai.credits, { n: balance ?? 0 })} · {t.ai.creditsHelp}</CardDescription>
        </CardHeader>
        <CardContent>
          {targets.length ? (
            <ActionForm action={runTranslation}>
              <input type="hidden" name="restaurant_id" value={restaurantId} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="locale">{t.ai.targetLanguage}</Label>
                  <select id="locale" name="locale" className={selectClass}>
                    {targets.map((l) => <option key={l} value={l}>{langName(l)}</option>)}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="category_id">{t.ai.scope}</Label>
                  <select id="category_id" name="category_id" className={selectClass}>
                    <option value="">{t.ai.allCategories}</option>
                    {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{tx(c.name, locale, source)}</option>)}
                  </select>
                </div>
              </div>
              <div><SubmitButton data-testid="translate-start">{t.ai.translate}</SubmitButton></div>
            </ActionForm>
          ) : (
            <p className="text-sm text-muted-foreground">{t.ai.noLanguages}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle as="h2" className="text-base">{t.menu.aiDraft}</CardTitle></CardHeader>
        <CardContent>
          {drafts.length ? (
            <ul className="divide-y">
              {drafts.map(({ entity, row, loc }) => (
                <li key={`${entity}-${row.id}-${loc}`} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid="translation-draft">
                  <span className="grid text-sm">
                    <span className="text-muted-foreground">{(row.name as Record<string, string>)[source]}</span>
                    <span dir="auto" className="font-medium">{(row.name as Record<string, string>)[loc]} <Badge tone="accent">{loc}</Badge></span>
                  </span>
                  <span className="flex items-center gap-1">
                    {entity === "menu_items" ? (
                      <Link className="text-sm underline" href={`/r/${restaurantId}/menu/items/${row.id}`}>{t.menu.edit}</Link>
                    ) : null}
                    <RowAction action={markReviewed} fields={{ restaurant_id: restaurantId, entity, id: row.id, locale: loc }} label={t.menu.markReviewed} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="no-drafts">{t.menu.translationsEmpty}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
