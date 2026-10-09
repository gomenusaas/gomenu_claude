import "./site.css";
import Link from "next/link";
import { fmt } from "@/lib/i18n";
import { publicMediaUrl } from "@/lib/media/url";
import type { SiteItem } from "@/lib/site/types";
import { AddToCart, CartBar } from "./cart";
import { FavoriteButton, ShareButton, Tracker } from "./client";
import { Img, money, PreviewBanner, priceLabel, type SiteProps, TableBanner } from "./parts";

/** One dish: photos and video, price and variants, options, allergens. Shareable link. */
export function ItemDetail({ p, item }: { p: SiteProps; item: SiteItem & { soldOut: boolean } }) {
  const { view, s } = p;
  const r = view.data.restaurant;
  const key = view.data.website.template;
  const name = view.tx(item.name);
  const images = item.media.filter((m) => m.kind === "image");
  const video = item.media.find((m) => m.kind === "video");
  const ordering = view.data.website.ordering_enabled && !p.ctx.preview;
  const canAdd = ordering && !item.soldOut;
  // Names and prices rendered here, so the client component needs no translation logic.
  const tx = Object.fromEntries([
    ...item.variants.map((v) => [v.id, view.tx(v.name)]),
    ...item.option_groups.flatMap((g) => [[g.id, view.tx(g.name)], ...g.options.map((o) => [o.id, view.tx(o.name)])]),
  ]);
  const price = Object.fromEntries([
    ...item.variants.map((v) => [v.id, money(v.price_minor, r.currency, view.locale)]),
    ...item.option_groups.flatMap((g) => g.options.map((o) => [o.id, money(o.price_delta_minor, r.currency, view.locale)])),
  ]);
  return (
    <div className={`gm-site gm-t-${key}`} dir={view.dir} lang={view.locale} data-template={key}>
      <PreviewBanner p={p} />
      <TableBanner p={p} />
      <div className="mx-auto grid max-w-2xl gap-5 pb-24">
        <div className="flex items-center justify-between px-4 pt-4">
          <Link href={view.path()} className="gm-chip min-w-0 max-w-[45%]" data-testid="item-back"><span className="truncate">← {r.name}</span></Link>
          <div className="flex items-center gap-2">
            {view.data.features.sharing ? (
              <ShareButton restaurantId={r.id} url={`${view.baseUrl}/item/${item.id}`} title={`${name} · ${r.name}`} entityId={item.id}
                           label={s.share} whatsappLabel={s.shareWhatsapp} preview={p.ctx.preview} />
            ) : null}
            <FavoriteButton restaurantId={r.id} itemId={item.id} initial={p.ctx.favorites.includes(item.id)} signInUrl={p.ctx.signInUrl}
                            labels={{ on: s.unfavorite, off: s.favorite }} />
          </div>
        </div>

        {images.length ? (
          <div className="flex snap-x gap-2 overflow-x-auto px-4" data-testid="item-photos">
            {images.map((m, i) => (
              <Img key={m.path} path={m.path} alt={name} eager={i === 0}
                   className={`${images.length > 1 ? "w-4/5" : "w-full"} aspect-[4/3] shrink-0 snap-center rounded-[var(--gm-radius-lg)] object-cover`} />
            ))}
          </div>
        ) : null}

        <div className="grid gap-2 px-4">
          <h1 className="text-2xl font-bold" data-testid="item-name">{name}</h1>
          <p className="text-lg font-semibold">{item.soldOut ? s.soldOut : priceLabel(item, p)}</p>
          {view.tx(item.description) ? <p className="opacity-85">{view.tx(item.description)}</p> : null}
          <div className="flex flex-wrap gap-1">
            {item.dietary_tags.map((d) => <span key={d} className="gm-tag">{s.dietaryNames[d] ?? d}</span>)}
            {item.spice_level ? <span className="gm-tag">{"🌶".repeat(item.spice_level)} {s.spice[item.spice_level]}</span> : null}
            {item.calories != null ? <span className="gm-tag">{fmt(s.calories, { n: item.calories })}</span> : null}
          </div>
        </div>

        {video ? (
          <video src={publicMediaUrl(video.path) ?? ""} poster={publicMediaUrl(video.poster_path) ?? undefined} preload="none" controls playsInline
                 className="mx-4 rounded-[var(--gm-radius-lg)]" />
        ) : null}

        {canAdd ? (
          <AddToCart restaurantId={r.id} item={item} tx={tx} price={price} branchId={view.branchId} locale={view.locale}
                     labels={{ ...s.order, required: s.required, optional: s.optional, choose: s.choose, chooseUpTo: s.chooseUpTo,
                               requiredMissing: s.order.errors.OPTIONS_REQUIRED }} />
        ) : null}

        {!canAdd && item.variants.length > 1 ? (
          <section className="mx-4 gm-card p-4">
            <ul className="grid gap-1">
              {item.variants.map((v) => (
                <li key={v.id} className="flex justify-between"><span>{view.tx(v.name)}</span>
                  <span>{money(v.price_minor, r.currency, view.locale)}</span></li>
              ))}
            </ul>
          </section>
        ) : null}

        {!canAdd && item.option_groups.map((g) => (
          <section key={g.id} className="mx-4 gm-card p-4" aria-labelledby={`g-${g.id}`}>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 id={`g-${g.id}`} className="font-semibold">{view.tx(g.name)}</h2>
              <span className="text-xs opacity-70">
                {g.min_select > 0 ? s.required : s.optional}
                {g.max_select ? ` · ${g.min_select > 0 ? fmt(s.choose, { min: g.min_select, max: g.max_select }) : fmt(s.chooseUpTo, { max: g.max_select })}` : ""}
              </span>
            </div>
            <ul className="grid gap-1 text-sm">
              {g.options.map((o) => (
                <li key={o.id} className={`flex justify-between ${o.is_available ? "" : "opacity-50"}`}>
                  <span>{view.tx(o.name)}</span>
                  {o.price_delta_minor ? <span>+{money(o.price_delta_minor, r.currency, view.locale)}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ))}

        {item.allergens.length ? (
          <section className="mx-4 text-sm" data-testid="item-allergens">
            <h2 className="font-semibold">{s.allergens}</h2>
            <p className="opacity-85">{item.allergens.map((a) => s.allergenNames[a] ?? a).join(" · ")}</p>
          </section>
        ) : null}
      </div>
      <Tracker restaurantId={r.id} locale={view.locale} branchId={view.branchId} disabled={p.ctx.preview}
               events={[{ type: "item_view", entityId: item.id }]} />
      {ordering ? (
        <CartBar restaurantId={r.id} href={view.path("/checkout")} label={s.order.viewOrder} itemsLabel={s.order.items} oneItemLabel={s.order.oneItem}
                 currency={r.currency} locale={view.locale} />
      ) : null}
    </div>
  );
}
