import "server-only";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { cache } from "react";
import type { Database } from "@/lib/database.types";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { siteTag } from "./revalidate";
import type { I18n, SiteData, SiteItem, SiteResult } from "./types";

/**
 * Visitors' data comes from public_site() with the anon key and no cookies, so responses are
 * cacheable. Dashboard changes refresh the cache at once; anything else (e.g. a Frame expiring,
 * a branch opening) shows within 30 s.
 */
function anonClient(tag?: string) {
  return createSupabase<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, next: { revalidate: 30, tags: tag ? [tag] : undefined } }) },
  });
}

export const getPublicSite = cache(async (restaurantId: string): Promise<SiteResult> => {
  // Tagged so dashboard saves refresh it immediately (lib/site/revalidate.ts); otherwise 30 s.
  const { data, error } = await anonClient(siteTag(restaurantId)).rpc("public_site", { p_restaurant_id: restaurantId });
  if (error) throw error;
  return (data ?? null) as unknown as SiteResult;
});

/** Staff preview (website.manage): unpublished sites and any template, with their own content. */
export async function getPreviewSite(restaurantId: string, template?: string): Promise<SiteData | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_site", { p_restaurant_id: restaurantId, p_template: template });
  if (error) return null;
  return data as unknown as SiteData;
}

export const resolveSlug = cache(async (slug: string) => {
  const { data } = await anonClient().rpc("resolve_restaurant_slug", { p_slug: slug });
  return data as { restaurant_id: string; slug: string; redirect: boolean; available: boolean } | null;
});

// --- View model ---------------------------------------------------------------------------

export interface SiteView {
  data: SiteData;
  locale: string;
  dir: "ltr" | "rtl";
  /** Text in the visitor's language, falling back to the restaurant's default, then any. */
  tx: (value: I18n | null | undefined) => string;
  branchId: string | null;
  categories: (SiteData["categories"][number] & { items: (SiteItem & { soldOut: boolean })[] })[];
  promotions: SiteData["promotions"];
  frames: SiteData["frames"];
  baseUrl: string;   // where this site lives (custom domain or /slug), for links and sharing
  path: (p?: string) => string;  // internal link keeping language and branch
}

export function buildView(data: SiteData, opts: {
  lang?: string; branch?: string; basePath: string; origin: string; keep?: Record<string, string>;
}): SiteView {
  const codes = data.languages.map((l) => l.code);
  const locale = opts.lang && codes.includes(opts.lang) ? opts.lang : data.restaurant.default_locale;
  const dir = data.languages.find((l) => l.code === locale)?.dir ?? (locale === "ar" ? "rtl" : "ltr");
  const fallback = data.restaurant.default_locale;
  const tx = (v: I18n | null | undefined) => (v ? v[locale] || v[fallback] || Object.values(v).find(Boolean) || "" : "");
  const branchId = opts.branch && data.branches.some((b) => b.id === opts.branch)
    ? opts.branch : data.branches.length === 1 ? data.branches[0].id : null;

  const override = (itemId: string, categoryId: string) =>
    branchId ? data.branch_overrides.filter((o) => o.branch_id === branchId && (o.item_id === itemId || o.category_id === categoryId)) : [];
  const categories = data.categories.map((c) => ({
    ...c,
    items: data.items.filter((i) => i.category_id === c.id)
      .filter((i) => !override(i.id, c.id).some((o) => o.is_hidden))
      .map((i) => ({ ...i, soldOut: !i.is_available || override(i.id, c.id).some((o) => !o.is_available) })),
  })).filter((c) => c.items.length > 0);
  const targeted = <T extends { branch_ids: string[] }>(list: T[]) =>
    list.filter((x) => x.branch_ids.length === 0 || !branchId || x.branch_ids.includes(branchId));

  const query = (extra?: Record<string, string>) => {
    const q = new URLSearchParams(opts.keep);
    if (locale !== fallback) q.set("lang", locale);
    if (opts.branch && branchId) q.set("branch", branchId);
    for (const [k, v] of Object.entries(extra ?? {})) q.set(k, v);
    const s = q.toString();
    return s ? `?${s}` : "";
  };
  return {
    data, locale, dir, tx, branchId, categories,
    promotions: targeted(data.promotions),
    frames: targeted(data.frames),
    baseUrl: `${opts.origin}${opts.basePath}`,
    path: (p = "") => `${opts.basePath}${p}${query()}`,
  };
}
