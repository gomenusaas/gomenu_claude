import { publicMediaUrl } from "@/lib/media/url";
import {
  About, Actions, Branches, CategoryNav, Contact, Footer, Frames, Gallery, Img, Logo, Menu, MenuItem, OpenBadge, Promotions,
  type SiteProps, TopBar,
} from "../parts";

/** Elegant: fine dining. Centred serif type, generous spacing, no clutter. */
export function Elegant({ p }: { p: SiteProps }) {
  const { data, tx } = p.view;
  const r = data.restaurant;
  return (
    <div className="mx-auto max-w-2xl">
      <TopBar p={p} />
      <header className="grid justify-items-center gap-4 px-6 py-16 text-center">
        <Logo p={p} className="size-20 rounded-full" />
        <h1 className="text-4xl tracking-[0.2em] uppercase">{r.name}</h1>
        <span aria-hidden className="block h-px w-24 bg-[var(--gm-color-border)]" />
        {tx(r.tagline) ? <p className="italic opacity-80">{tx(r.tagline)}</p> : null}
        <OpenBadge p={p} />
        <Actions p={p} className="justify-center" />
      </header>
      <About p={p} className="text-center" />
      <div className="mt-12 grid gap-14">
        <Frames p={p} />
        <Promotions p={p} layout="banner" />
        <Menu p={p} className="text-center [&_li_a]:justify-center" headingClassName="mb-6" />
        <Gallery p={p} layout="strip" />
        <Branches p={p} />
        <Contact p={p} className="text-center [&>div]:justify-center" />
        <Footer p={p} />
      </div>
    </div>
  );
}

/** Magazine: editorial layout, a story about the restaurant, a feature photo per category. */
export function Magazine({ p }: { p: SiteProps }) {
  const { data, tx, categories } = p.view;
  const r = data.restaurant;
  const style = data.website.menu_style;
  return (
    <div className="mx-auto max-w-6xl">
      <TopBar p={p} className="border-b" />
      <header className="grid gap-6 px-4 py-8 md:grid-cols-2 md:items-center">
        {r.cover_path ? <Img path={r.cover_path} className="aspect-[4/3] w-full rounded-sm object-cover" eager /> : <div className="gm-placeholder aspect-[4/3] w-full" />}
        <div className="grid gap-4">
          <Logo p={p} className="size-14 rounded-sm" />
          <h1 className="font-[family-name:var(--gm-site-heading)] text-5xl font-bold leading-tight">{r.name}</h1>
          {tx(r.tagline) ? <blockquote className="border-s-4 border-accent ps-4 text-xl italic">{tx(r.tagline)}</blockquote> : null}
          <OpenBadge p={p} />
          <Actions p={p} />
        </div>
      </header>
      <div className="grid gap-12 md:grid-cols-[2fr_1fr]">
        <About p={p} className="md:col-span-2 md:columns-2 md:gap-10" />
        <div className="grid gap-12 md:col-span-2">
          <Frames p={p} />
          <Promotions p={p} layout="cards" />
          <div className="grid gap-12 px-4" data-testid="site-menu" data-style={style}>
            {categories.map((c) => {
              const feature = c.items.flatMap((i) => i.media).find((m) => m.kind === "image");
              return (
                <section key={c.id} id={`c-${c.id}`} className="grid gap-4 md:grid-cols-[1fr_2fr]">
                  <div>
                    <h2 className="gm-h2">{tx(c.name)}</h2>
                    {feature ? <Img path={feature.path} className="mt-3 aspect-square w-full rounded-sm object-cover" /> : null}
                  </div>
                  <ul className={style === "grid" ? "grid grid-cols-2 gap-3" : "divide-y"}>
                    {c.items.map((i) => <MenuItem key={i.id} p={p} item={i} style={style} />)}
                  </ul>
                </section>
              );
            })}
          </div>
          <Gallery p={p} layout="strip" />
          <Branches p={p} />
          <Contact p={p} />
          <Footer p={p} />
        </div>
      </div>
    </div>
  );
}

/** Café: warm and cosy; categories in a sidebar on larger screens. */
export function Cafe({ p }: { p: SiteProps }) {
  const { data, tx } = p.view;
  const r = data.restaurant;
  const cover = publicMediaUrl(r.cover_path);
  return (
    <div className="mx-auto max-w-6xl">
      <TopBar p={p} />
      <header className="mx-4 overflow-hidden rounded-[var(--gm-radius-lg)] bg-card shadow-sm">
        {cover ? <Img path={r.cover_path} className="h-40 w-full object-cover" eager /> : null}
        <div className="flex flex-wrap items-center gap-4 p-5">
          <Logo p={p} className="size-16 rounded-full" />
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold">{r.name}</h1>
            {tx(r.tagline) ? <p className="opacity-80">{tx(r.tagline)}</p> : null}
          </div>
          <OpenBadge p={p} />
          <Actions p={p} />
        </div>
      </header>
      <Frames p={p} />
      <div className="mt-6 grid gap-8 md:grid-cols-[14rem_1fr]">
        <aside className="hidden md:block">
          <div className="sticky top-4 rounded-[var(--gm-radius-lg)] bg-card p-3">
            <CategoryNav p={p} vertical />
          </div>
        </aside>
        <div className="grid gap-8">
          <CategoryNav p={p} className="md:hidden" />
          <Promotions p={p} layout="cards" />
          <Menu p={p} />
          <About p={p} />
          <Gallery p={p} />
          <Branches p={p} />
          <Contact p={p} />
          <Footer p={p} />
        </div>
      </div>
    </div>
  );
}
