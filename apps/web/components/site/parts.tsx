import { cn } from "@gomenu/ui";
import Link from "next/link";
import { fmt } from "@/lib/i18n";
import { publicMediaUrl } from "@/lib/media/url";
import type { SiteView } from "@/lib/site/data";
import { intlLocale, type SiteStrings } from "@/lib/site/strings";
import type { SiteBranch, SiteItem, TableContext } from "@/lib/site/types";
import { FavoriteButton, FramesBar, type GoBranch, GoButton, PromotionTracker, ShareButton } from "./client";

export interface SiteProps {
  view: SiteView;
  s: SiteStrings;
  ctx: {
    preview: boolean;
    signedIn: boolean;
    favorites: string[];   // item ids, plus "restaurant" when the restaurant itself is a favorite
    table: TableContext | null;
    signInUrl: string;
    accountUrl: string;
    langUrl: (code: string) => string;
  };
}

// --- Formatting ------------------------------------------------------------------------------

const EXP: Record<string, number> = { OMR: 3, BHD: 3, KWD: 3 };
export function money(minor: number, currency: string, locale: string) {
  const exp = EXP[currency] ?? 2;
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency", currency, minimumFractionDigits: minor % 10 ** exp === 0 ? 0 : exp, maximumFractionDigits: exp,
  }).format(minor / 10 ** exp);
}

export function priceLabel(item: SiteItem, p: SiteProps) {
  const { currency } = p.view.data.restaurant;
  if (item.variants.length > 1) {
    const min = Math.min(...item.variants.map((v) => v.price_minor));
    return fmt(p.s.from, { price: money(min, currency, p.view.locale) });
  }
  return money(item.variants[0]?.price_minor ?? item.price_minor, currency, p.view.locale);
}

export function mapsUrl(b: SiteBranch) {
  if (b.maps_url) return b.maps_url;
  if (b.latitude != null && b.longitude != null) return `https://www.google.com/maps/search/?api=1&query=${b.latitude},${b.longitude}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address ?? b.name)}`;
}

export function Img({ path, alt = "", className, eager }: { path: string | null | undefined; alt?: string; className?: string; eager?: boolean }) {
  const src = publicMediaUrl(path);
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} loading={eager ? "eager" : "lazy"} decoding="async" />;
}

// --- Chrome ----------------------------------------------------------------------------------

export function PreviewBanner({ p }: { p: SiteProps }) {
  if (!p.ctx.preview) return null;
  return <div className="bg-warning px-4 py-2 text-center text-sm text-warning-foreground" data-testid="preview-banner">{p.s.previewBanner}</div>;
}

export function TableBanner({ p }: { p: SiteProps }) {
  const t = p.ctx.table;
  if (!t?.table_label) return null;
  return <div className="bg-accent px-4 py-2 text-center text-sm text-accent-foreground" data-testid="table-banner">{fmt(p.s.tableNote, { label: t.table_label })}</div>;
}

/** Language links, branch picker and the diner account link. */
export function TopBar({ p, className }: { p: SiteProps; className?: string }) {
  const { data, locale, branchId } = p.view;
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm", className)}>
      <nav aria-label={p.s.language} className="flex flex-wrap gap-1">
        {data.languages.length > 1 ? data.languages.map((l) => (
          <a key={l.code} href={p.ctx.langUrl(l.code)} hrefLang={l.code} lang={l.code} aria-current={l.code === locale ? "true" : undefined}
             className={cn("rounded px-2 py-1", l.code === locale ? "font-semibold underline" : "opacity-80 hover:opacity-100")}>
            {l.native_name}
          </a>
        )) : null}
      </nav>
      <div className="flex items-center gap-2">
        {data.branches.length > 1 ? (
          <form method="get" className="flex items-center gap-1">
            {locale !== data.restaurant.default_locale ? <input type="hidden" name="lang" value={locale} /> : null}
            <label className="sr-only" htmlFor="branch-picker">{p.s.branch}</label>
            <select id="branch-picker" name="branch" defaultValue={branchId ?? ""} className="gm-select" data-testid="branch-picker">
              <option value="">{p.s.allBranches}</option>
              {data.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button type="submit" className="gm-chip">✓</button>
          </form>
        ) : null}
        <a href={p.ctx.signedIn ? p.ctx.accountUrl : p.ctx.signInUrl} className="gm-chip" data-testid="diner-link">
          {p.ctx.signedIn ? p.s.myAccount : p.s.signIn}
        </a>
      </div>
    </div>
  );
}

export function goBranches(p: SiteProps): GoBranch[] {
  return p.view.data.branches.map((b) => ({
    id: b.id, name: b.name, address: b.address, url: mapsUrl(b), isOpen: b.is_open,
    openLabel: b.is_open ? p.s.openNow : p.s.closedNow,
  }));
}

/** GO + share + favorite: present in every template (spec §7). */
export function Actions({ p, className, goClassName }: { p: SiteProps; className?: string; goClassName?: string }) {
  const { data, tx } = p.view;
  const r = data.restaurant;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <GoButton restaurantId={r.id} branches={goBranches(p)} label={p.s.go} chooseLabel={p.s.chooseBranch}
                closeLabel={p.s.close} className={goClassName} preview={p.ctx.preview} />
      {data.features.sharing ? (
        <ShareButton restaurantId={r.id} url={p.view.baseUrl} title={`${r.name} – ${tx(r.tagline)}`} label={p.s.share}
                     whatsappLabel={p.s.shareWhatsapp} preview={p.ctx.preview} />
      ) : null}
      <FavoriteButton restaurantId={r.id} itemId={null} initial={p.ctx.favorites.includes("restaurant")}
                      signInUrl={p.ctx.signInUrl} labels={{ on: p.s.unfavorite, off: p.s.favorite }} />
    </div>
  );
}

export function OpenBadge({ p, branch }: { p: SiteProps; branch?: SiteBranch }) {
  const b = branch ?? p.view.data.branches.find((x) => x.id === p.view.branchId) ?? p.view.data.branches[0];
  if (!b) return null;
  return (
    <span className={cn("gm-badge", b.is_open ? "gm-badge-open" : "gm-badge-closed")} data-testid="site-open-state">
      {b.is_open ? p.s.openNow : p.s.closedNow}
    </span>
  );
}

// --- Content sections ------------------------------------------------------------------------

export function Frames({ p }: { p: SiteProps }) {
  const { view } = p;
  if (view.frames.length === 0) return null;
  return (
    <FramesBar restaurantId={view.data.restaurant.id} branchId={view.branchId} preview={p.ctx.preview}
               labels={{ title: p.s.frames, close: p.s.close, next: p.s.next, previous: p.s.previous, open: p.s.viewItem }}
               frames={view.frames.map((f) => ({
                 id: f.id, kind: f.kind, url: publicMediaUrl(f.path) ?? "", poster: publicMediaUrl(f.poster_path),
                 caption: view.tx(f.caption), link: f.item_id ? view.path(`/item/${f.item_id}`) : null,
               }))} />
  );
}

export function Promotions({ p, layout = "cards", className }: { p: SiteProps; layout?: "cards" | "banner" | "carousel"; className?: string }) {
  const { view } = p;
  if (view.promotions.length === 0) return null;
  const date = (iso: string) => new Intl.DateTimeFormat(intlLocale(view.locale), { dateStyle: "medium" }).format(new Date(iso));
  return (
    <section aria-label={p.s.promotions} className={cn("px-4", className)}>
      <h2 className="gm-h2 mb-3">{p.s.promotions}</h2>
      <div className={cn(layout === "carousel" ? "flex snap-x gap-3 overflow-x-auto pb-2" : layout === "banner" ? "grid gap-3" : "grid gap-3 sm:grid-cols-2")}>
        {view.promotions.map((promo) => (
          <PromotionTracker key={promo.id} restaurantId={view.data.restaurant.id} promotionId={promo.id} branchId={view.branchId}
                            preview={p.ctx.preview} href={promo.item_id ? view.path(`/item/${promo.item_id}`) : null}
                            className={cn("gm-card overflow-hidden", layout === "carousel" && "w-72 shrink-0 snap-start",
                                          layout === "banner" && "flex items-center gap-3")}>
            {promo.image_path ? <Img path={promo.image_path} className={layout === "banner" ? "h-24 w-32 object-cover" : "aspect-[16/9] w-full object-cover"} /> : null}
            <div className="p-3">
              <h3 className="font-semibold">{view.tx(promo.title)}</h3>
              {view.tx(promo.body) ? <p className="text-sm opacity-80">{view.tx(promo.body)}</p> : null}
              {promo.ends_at ? <p className="mt-1 text-xs opacity-70">{fmt(p.s.until, { date: date(promo.ends_at) })}</p> : null}
            </div>
          </PromotionTracker>
        ))}
      </div>
    </section>
  );
}

export function CategoryNav({ p, sticky, vertical, className }: { p: SiteProps; sticky?: boolean; vertical?: boolean; className?: string }) {
  return (
    <nav aria-label={p.s.menu} className={cn(sticky && "sticky top-0 z-10", className)}>
      <ul className={cn(vertical ? "grid gap-1" : "flex gap-2 overflow-x-auto px-4 py-2")}>
        {p.view.categories.map((c) => (
          <li key={c.id} className="shrink-0">
            <a href={`#c-${c.id}`} className={vertical ? "block rounded px-3 py-2 hover:bg-muted" : "gm-chip whitespace-nowrap"}>{p.view.tx(c.name)}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Tags({ p, item }: { p: SiteProps; item: SiteItem }) {
  if (!item.dietary_tags.length && !item.spice_level) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {item.dietary_tags.map((d) => <span key={d} className="gm-tag">{p.s.dietaryNames[d] ?? d}</span>)}
      {item.spice_level ? <span className="gm-tag" aria-label={p.s.spice[item.spice_level]}>{"🌶".repeat(item.spice_level)}</span> : null}
    </span>
  );
}

export function MenuItem({ p, item, style }: { p: SiteProps; item: SiteItem & { soldOut: boolean }; style: "list" | "grid" | "compact" }) {
  const { view } = p;
  const href = view.path(`/item/${item.id}`);
  const cover = item.media.find((m) => m.kind === "image");
  const name = view.tx(item.name);
  const description = view.tx(item.description);
  if (style === "compact") {
    return (
      <li data-testid="site-item" className={cn("py-2", item.soldOut && "opacity-60")}>
        <Link href={href} className="flex items-baseline gap-2">
          <span className="font-medium">{name}</span>
          <span className="flex-1 border-b border-dotted opacity-40" aria-hidden />
          <span className="whitespace-nowrap">{item.soldOut ? p.s.soldOut : priceLabel(item, p)}</span>
        </Link>
      </li>
    );
  }
  if (style === "grid") {
    return (
      <li data-testid="site-item" className={cn("gm-card overflow-hidden", item.soldOut && "opacity-60")}>
        <Link href={href} className="block">
          {cover ? <Img path={cover.path} alt={name} className="aspect-square w-full object-cover" /> : <div className="gm-placeholder aspect-square w-full" />}
          <div className="grid gap-1 p-3">
            <span className="font-medium">{name}</span>
            <span className="text-sm">{item.soldOut ? p.s.soldOut : priceLabel(item, p)}</span>
            <Tags p={p} item={item} />
          </div>
        </Link>
      </li>
    );
  }
  return (
    <li data-testid="site-item" className={cn("py-3", item.soldOut && "opacity-60")}>
      <Link href={href} className="flex gap-3">
        <div className="grid flex-1 content-start gap-1">
          <span className="font-medium">{name}</span>
          {description ? <span className="line-clamp-2 text-sm opacity-75">{description}</span> : null}
          <span className="text-sm font-medium">{item.soldOut ? p.s.soldOut : priceLabel(item, p)}</span>
          <Tags p={p} item={item} />
        </div>
        {cover ? <Img path={cover.path} alt={name} className="size-24 shrink-0 rounded-md object-cover" /> : null}
      </Link>
    </li>
  );
}

/** The menu, in the restaurant's chosen display style (separate from the template). */
export function Menu({ p, style, className, headingClassName }: {
  p: SiteProps; style?: "list" | "grid" | "compact"; className?: string; headingClassName?: string;
}) {
  const s = style ?? p.view.data.website.menu_style;
  return (
    <div className={cn("grid gap-8 px-4", className)} data-testid="site-menu" data-style={s}>
      {p.view.categories.map((c) => (
        <section key={c.id} id={`c-${c.id}`} aria-labelledby={`h-${c.id}`} className="scroll-mt-16">
          <h2 id={`h-${c.id}`} className={cn("gm-h2 mb-2", headingClassName)}>{p.view.tx(c.name)}</h2>
          {p.view.tx(c.description) ? <p className="mb-2 text-sm opacity-75">{p.view.tx(c.description)}</p> : null}
          <ul className={cn(s === "grid" ? "grid grid-cols-2 gap-3 md:grid-cols-3" : "divide-y")}>
            {c.items.map((i) => <MenuItem key={i.id} p={p} item={i} style={s} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function Gallery({ p, layout = "grid", className }: { p: SiteProps; layout?: "grid" | "strip"; className?: string }) {
  const items = p.view.data.gallery;
  if (!items.length) return null;
  return (
    <section aria-label={p.s.gallery} className={cn("px-4", className)} data-testid="site-gallery">
      <h2 className="gm-h2 mb-3">{p.s.gallery}</h2>
      <ul className={layout === "strip" ? "flex snap-x gap-2 overflow-x-auto" : "grid grid-cols-2 gap-2 md:grid-cols-3"}>
        {items.map((g) => (
          <li key={g.id} className={layout === "strip" ? "w-64 shrink-0 snap-start" : undefined}>
            {g.kind === "image" ? (
              <Img path={g.path} alt={p.view.tx(g.caption)} className="aspect-square w-full rounded-md object-cover" />
            ) : (
              <video src={publicMediaUrl(g.path) ?? ""} poster={publicMediaUrl(g.poster_path) ?? undefined} preload="none" controls
                     className="aspect-square w-full rounded-md object-cover" />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Hours({ p, branch }: { p: SiteProps; branch: SiteBranch }) {
  if (!branch.hours.length) return null;
  return (
    <table className="text-sm">
      <caption className="sr-only">{p.s.hours}</caption>
      <tbody>
        {[0, 1, 2, 3, 4, 5, 6].map((d) => {
          const periods = branch.hours.filter((h) => h.day === d);
          return (
            <tr key={d}>
              <th scope="row" className="pe-4 text-start font-normal opacity-75">{p.s.days[d]}</th>
              <td dir="ltr" className="text-end">{periods.length ? periods.map((h) => `${h.opens}–${h.closes}`).join(", ") : p.s.closed}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function Branches({ p, className }: { p: SiteProps; className?: string }) {
  const { data } = p.view;
  if (!data.website.show_branches || !data.branches.length) return null;
  return (
    <section aria-label={p.s.branches} className={cn("px-4", className)} data-testid="site-branches">
      <h2 className="gm-h2 mb-3">{p.s.branches}</h2>
      <ul className="grid gap-4 md:grid-cols-2">
        {data.branches.map((b) => (
          <li key={b.id} className="gm-card grid gap-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">{b.name}</h3>
              <OpenBadge p={p} branch={b} />
            </div>
            {b.address ? <p className="text-sm opacity-80">{b.address}</p> : null}
            {data.website.show_hours ? <Hours p={p} branch={b} /> : null}
            <div className="flex flex-wrap gap-2 text-sm">
              <a href={mapsUrl(b)} target="_blank" rel="noopener" className="gm-chip">{p.s.go}</a>
              {b.phone ? <a href={`tel:${b.phone}`} className="gm-chip" dir="ltr">{p.s.call}</a> : null}
              {b.whatsapp ? <a href={`https://wa.me/${b.whatsapp.replace("+", "")}`} className="gm-chip">{p.s.whatsapp}</a> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const SOCIAL_LABEL: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", x: "X", facebook: "Facebook", snapchat: "Snapchat" };

export function Contact({ p, className }: { p: SiteProps; className?: string }) {
  const r = p.view.data.restaurant;
  const social = Object.entries(r.social_links ?? {}).filter(([, url]) => url);
  if (!r.contact_phone && !r.whatsapp && !r.contact_email && !social.length) return null;
  return (
    <section aria-label={p.s.contact} className={cn("px-4", className)} data-testid="site-contact">
      <h2 className="gm-h2 mb-3">{p.s.contact}</h2>
      <div className="flex flex-wrap gap-2 text-sm">
        {r.contact_phone ? <a href={`tel:${r.contact_phone}`} className="gm-chip"><span dir="ltr">{r.contact_phone}</span></a> : null}
        {r.whatsapp ? <a href={`https://wa.me/${r.whatsapp.replace("+", "")}`} className="gm-chip">{p.s.whatsapp}</a> : null}
        {r.contact_email ? <a href={`mailto:${r.contact_email}`} className="gm-chip">{p.s.email}</a> : null}
        {social.map(([k, url]) => <a key={k} href={url} target="_blank" rel="noopener me" className="gm-chip">{SOCIAL_LABEL[k] ?? k}</a>)}
      </div>
    </section>
  );
}

export function About({ p, className }: { p: SiteProps; className?: string }) {
  const text = p.view.tx(p.view.data.restaurant.description);
  if (!text) return null;
  return (
    <section aria-label={p.s.about} className={cn("px-4", className)}>
      <h2 className="gm-h2 mb-2">{p.s.about}</h2>
      <p className="whitespace-pre-line opacity-85">{text}</p>
    </section>
  );
}

export function Footer({ p, className }: { p: SiteProps; className?: string }) {
  return (
    <footer className={cn("px-4 py-8 text-center text-xs opacity-60", className)}>
      {p.view.data.website.ordering_enabled ? <p className="mb-2">{p.s.orderingSoon}</p> : null}
      <p>© {p.view.data.restaurant.name} · {p.s.poweredBy}</p>
    </footer>
  );
}

export function Logo({ p, className }: { p: SiteProps; className?: string }) {
  const r = p.view.data.restaurant;
  return r.logo_path ? <Img path={r.logo_path} alt={r.name} className={cn("object-cover", className)} eager /> : null;
}
