import "server-only";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { Checkout, type OrderingInfo } from "@/components/site/checkout";
import { ItemDetail } from "@/components/site/item";
import { OrderTracker, type TrackedOrder } from "@/components/site/order-tracker";
import type { SiteProps } from "@/components/site/parts";
import { SiteRenderer } from "@/components/site/render";
import { Unavailable } from "@/components/site/unavailable";
import { publicEnv } from "@/lib/env";
import { publicMediaUrl } from "@/lib/media/url";
import { createClient } from "@/lib/supabase/server";
import { buildView, getPreviewSite, getPublicSite } from "./data";
import { siteStrings } from "./strings";
import { type SiteData, TABLE_COOKIE, type TableContext } from "./types";

type Search = { lang?: string; branch?: string; template?: string };

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
  return host ? `${proto}://${host}` : publicEnv.NEXT_PUBLIC_APP_URL;
}

/** Visitor context: signed-in diner, their favorites here, and any table QR context. */
async function visitorContext(restaurantId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  let favorites: string[] = [];
  if (auth.user) {
    const { data } = await supabase.from("diner_favorites").select("item_id").eq("restaurant_id", restaurantId);
    favorites = (data ?? []).map((f) => f.item_id ?? "restaurant");
  }
  let table: TableContext | null = null;
  try {
    const raw = (await cookies()).get(TABLE_COOKIE)?.value;
    const parsed = raw ? (JSON.parse(raw) as TableContext) : null;
    table = parsed?.restaurant_id === restaurantId ? parsed : null;
  } catch {
    table = null;
  }
  return { signedIn: Boolean(auth.user), favorites, table };
}

async function load(restaurantId: string, preview: boolean, template?: string): Promise<SiteData | { unavailable: string }> {
  if (preview) {
    const data = await getPreviewSite(restaurantId, template);
    if (!data) notFound();
    return data;
  }
  const result = await getPublicSite(restaurantId);
  if (!result) notFound();
  if (result.status === "unavailable") return { unavailable: result.restaurant.name };
  return result;
}

async function props(data: SiteData, basePath: string, search: Search, preview: boolean, currentPath: string): Promise<SiteProps> {
  const keep = preview && search.template ? { template: search.template } : undefined;
  const view = buildView(data, { lang: search.lang, branch: search.branch, basePath, origin: await origin(), keep });
  const visitor = await visitorContext(data.restaurant.id);
  const langUrl = (code: string) => {
    const q = new URLSearchParams(keep);
    if (code !== data.restaurant.default_locale) q.set("lang", code);
    if (search.branch) q.set("branch", search.branch);
    const s = q.toString();
    return `${currentPath}${s ? `?${s}` : ""}`;
  };
  return {
    view,
    s: siteStrings(view.locale),
    ctx: {
      preview, ...visitor, langUrl,
      signInUrl: `/me/login?next=${encodeURIComponent(view.path(currentPath.slice(basePath.length)))}`,
      accountUrl: "/me",
    },
  };
}

/** Restaurant home page. basePath: "/{slug}" on gomenu, "" on a custom domain. */
export async function renderSiteHome(restaurantId: string, basePath: string, search: Search, preview = false) {
  const data = await load(restaurantId, preview, search.template);
  if ("unavailable" in data) return <Unavailable name={data.unavailable} locale={search.lang ?? "en"} />;
  return <SiteRenderer p={await props(data, basePath, search, preview, basePath || "/")} />;
}

export async function renderSiteItem(restaurantId: string, itemId: string, basePath: string, search: Search, preview = false) {
  const data = await load(restaurantId, preview, search.template);
  if ("unavailable" in data) return <Unavailable name={data.unavailable} locale={search.lang ?? "en"} />;
  const p = await props(data, basePath, search, preview, `${basePath}/item/${itemId}`);
  const item = p.view.categories.flatMap((c) => c.items).find((i) => i.id === itemId);
  if (!item) notFound();
  return <ItemDetail p={p} item={item} />;
}

/** The diner's order: cart lines, service, details, totals. Not indexed. */
export async function renderCheckout(restaurantId: string, basePath: string, search: Search) {
  const data = await load(restaurantId, false);
  if ("unavailable" in data) return <Unavailable name={data.unavailable} locale={search.lang ?? "en"} />;
  const p = await props(data, basePath, search, false, `${basePath}/checkout`);
  const supabase = await createClient();
  const [{ data: info }, { data: auth }] = await Promise.all([
    supabase.rpc("public_ordering", { p_restaurant_id: restaurantId }),
    supabase.auth.getUser(),
  ]);
  if (!info) notFound();
  let profile: { name: string; phone: string } | null = null;
  if (auth.user) {
    const { data: me } = await supabase.from("profiles").select("full_name, phone_e164").eq("id", auth.user.id).single();
    profile = { name: me?.full_name ?? "", phone: me?.phone_e164 ?? "" };
  }
  const { view } = p;
  const table = p.ctx.table;
  return (
    <div className={`gm-site gm-t-${data.website.template}`} dir={view.dir} lang={view.locale} data-template={data.website.template}>
      <Checkout restaurantId={restaurantId} info={info as unknown as OrderingInfo} s={p.s} locale={view.locale}
                defaultLocale={data.restaurant.default_locale}
                branches={data.branches.map((b) => ({ id: b.id, name: b.name, is_open: b.is_open }))}
                defaultBranchId={table?.branch_id ?? view.branchId} tableLabel={table?.table_label ?? null}
                profile={profile} menuHref={view.path()} orderPath={view.path("/order/{key}")} />
    </div>
  );
}

/** Live tracking for whoever holds the order's link (guest or signed in). */
export async function renderOrder(restaurantId: string, publicKey: string, basePath: string, search: Search) {
  if (!/^[A-Za-z0-9_-]{22,64}$/.test(publicKey)) notFound();
  const data = await load(restaurantId, false);
  if ("unavailable" in data) return <Unavailable name={data.unavailable} locale={search.lang ?? "en"} />;
  const p = await props(data, basePath, search, false, `${basePath}/order/${publicKey}`);
  const supabase = await createClient();
  const { data: order } = await supabase.rpc("track_order", { p_public_key: publicKey });
  const tracked = order as unknown as (TrackedOrder & { restaurant_id: string }) | null;
  if (!tracked || tracked.restaurant_id !== restaurantId) notFound();
  const { view } = p;
  return (
    <div className={`gm-site gm-t-${data.website.template}`} dir={view.dir} lang={view.locale} data-template={data.website.template}>
      <OrderTracker publicKey={publicKey} order={tracked} locale={view.locale} s={p.s} menuHref={view.path()} signedIn={p.ctx.signedIn} />
    </div>
  );
}

/** SEO: per-language title/description, social image, canonical address (custom domain first). */
export async function siteMetadata(restaurantId: string, basePath: string, search: Search, itemId?: string): Promise<Metadata> {
  const result = await getPublicSite(restaurantId);
  if (!result || result.status !== "ok") return { robots: { index: false } };
  const view = buildView(result, { lang: search.lang, basePath, origin: await origin() });
  const r = result.restaurant;
  const item = itemId ? result.items.find((i) => i.id === itemId) : null;
  const canonicalBase = result.canonical_host ? `https://${result.canonical_host}` : `${publicEnv.NEXT_PUBLIC_APP_URL}/${r.slug}`;
  const path = itemId ? `/item/${itemId}` : "";
  const title = item ? `${view.tx(item.name)} · ${r.name}` : view.tx(result.website.seo_title) || r.name;
  const description = item ? view.tx(item.description) || view.tx(r.tagline) : view.tx(result.website.seo_description) || view.tx(r.tagline);
  const image = publicMediaUrl(item?.media.find((m) => m.kind === "image")?.path ?? r.cover_path ?? r.logo_path);
  const langQuery = (code: string) => (code === r.default_locale ? "" : `?lang=${code}`);
  return {
    title: { absolute: title },
    description: description || undefined,
    alternates: {
      canonical: `${canonicalBase}${path}${langQuery(view.locale)}`,
      languages: Object.fromEntries(result.languages.map((l) => [l.code, `${canonicalBase}${path}${langQuery(l.code)}`])),
    },
    openGraph: { title, description: description || undefined, images: image ? [image] : undefined, type: "website" },
  };
}
