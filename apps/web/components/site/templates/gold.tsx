import Link from "next/link";
import { publicMediaUrl } from "@/lib/media/url";
import {
  Actions, Branches, CategoryNav, Contact, Footer, Frames, Gallery, Img, Logo, Menu, MenuItem, OpenBadge, Promotions, type SiteProps,
  TopBar, priceLabel,
} from "../parts";

/** Showcase: full-screen hero, Frames and an offers carousel up front. */
export function Showcase({ p }: { p: SiteProps }) {
  const { data, tx } = p.view;
  const r = data.restaurant;
  const cover = publicMediaUrl(r.cover_path);
  return (
    <>
      <header className="gm-hero gm-on-dark relative flex flex-col justify-between bg-neutral-900 text-white"
              style={cover ? { backgroundImage: `linear-gradient(to top, rgb(0 0 0 / .75), rgb(0 0 0 / .15)), url(${cover})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
        <TopBar p={p} className="text-white" />
        <div className="mx-auto w-full max-w-5xl px-4 pb-10">
          <Logo p={p} className="mb-4 size-20 rounded-full border-2 border-white" />
          <h1 className="text-4xl font-extrabold md:text-6xl">{r.name}</h1>
          {tx(r.tagline) ? <p className="mt-2 max-w-xl text-lg opacity-90">{tx(r.tagline)}</p> : null}
          <div className="mt-3"><OpenBadge p={p} /></div>
          <Actions p={p} className="mt-6" goClassName="gm-go text-lg" />
        </div>
      </header>
      <div className="mx-auto grid max-w-5xl gap-10 py-6">
        <Frames p={p} />
        <Promotions p={p} layout="carousel" />
        <div>
          <CategoryNav p={p} sticky className="bg-background/95 backdrop-blur" />
          <Menu p={p} className="mt-4" />
        </div>
        <Gallery p={p} layout="strip" />
        <Branches p={p} />
        <Contact p={p} />
        <Footer p={p} />
      </div>
    </>
  );
}

/** Bold: dark, big type; in grid style every category scrolls sideways. */
export function Bold({ p }: { p: SiteProps }) {
  const { data, tx, categories } = p.view;
  const r = data.restaurant;
  const style = data.website.menu_style;
  return (
    <div className="mx-auto max-w-6xl">
      <TopBar p={p} />
      <header className="grid gap-4 px-4 py-10">
        <div className="flex items-center gap-4">
          <Logo p={p} className="size-14 rounded-md" />
          <OpenBadge p={p} />
        </div>
        <h1 className="text-5xl font-black uppercase leading-none tracking-tight md:text-7xl">{r.name}</h1>
        {tx(r.tagline) ? <p className="max-w-2xl text-xl text-muted-foreground">{tx(r.tagline)}</p> : null}
        <Actions p={p} goClassName="gm-go text-xl px-10 py-4" />
      </header>
      <Frames p={p} />
      <Promotions p={p} layout="carousel" className="mt-6" />
      {style === "grid" ? (
        <div className="mt-10 grid gap-10" data-testid="site-menu" data-style="grid">
          {categories.map((c) => (
            <section key={c.id} id={`c-${c.id}`} className="scroll-mt-4">
              <h2 className="gm-h2 mb-3 px-4">{tx(c.name)}</h2>
              <ul className="flex snap-x gap-3 overflow-x-auto px-4 pb-2">
                {c.items.map((i) => (
                  <li key={i.id} data-testid="site-item" className={`gm-card w-56 shrink-0 snap-start overflow-hidden ${i.soldOut ? "opacity-60" : ""}`}>
                    <Link href={p.view.path(`/item/${i.id}`)} className="block">
                      {i.media[0] ? <Img path={i.media.find((m) => m.kind === "image")?.path} className="aspect-[4/5] w-full object-cover" /> : <div className="gm-placeholder aspect-[4/5]" />}
                      <div className="p-3">
                        <p className="font-bold uppercase">{tx(i.name)}</p>
                        <p className="text-accent">{i.soldOut ? p.s.soldOut : priceLabel(i, p)}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <>
          <CategoryNav p={p} sticky className="mt-8 bg-background" />
          <Menu p={p} className="mt-4" />
        </>
      )}
      <div className="mt-12 grid gap-10">
        <Gallery p={p} layout="strip" />
        <Branches p={p} />
        <Contact p={p} />
        <Footer p={p} />
      </div>
    </div>
  );
}

/** Street: loud and playful; GO and share stay pinned to the bottom of the screen. */
export function Street({ p }: { p: SiteProps }) {
  const { data, tx, categories } = p.view;
  const r = data.restaurant;
  return (
    <div className="mx-auto max-w-3xl pb-28">
      <TopBar p={p} />
      <header className="px-4 py-6 text-center">
        <Logo p={p} className="mx-auto mb-3 size-24 -rotate-3 rounded-xl border-2 border-black shadow-[4px_4px_0_#111]" />
        <h1 className="text-4xl font-black">{r.name}</h1>
        {tx(r.tagline) ? <p className="mt-1 font-medium">{tx(r.tagline)}</p> : null}
        <div className="mt-2 flex justify-center"><OpenBadge p={p} /></div>
      </header>
      <Frames p={p} />
      <Promotions p={p} layout="banner" className="mt-4" />
      <nav aria-label={p.s.menu} className="mt-6 flex flex-wrap justify-center gap-2 px-4">
        {categories.map((c) => <a key={c.id} href={`#c-${c.id}`} className="gm-chip font-bold">{tx(c.name)}</a>)}
      </nav>
      <div className="mt-6 grid gap-8">
        {categories.map((c) => (
          <section key={c.id} id={`c-${c.id}`} className="px-4">
            <h2 className="gm-h2 mb-3">{tx(c.name)}</h2>
            <ul className={data.website.menu_style === "grid" ? "grid grid-cols-2 gap-3" : "grid gap-3"} data-testid="site-menu" data-style={data.website.menu_style}>
              {c.items.map((i) => (data.website.menu_style === "list"
                ? (
                  <li key={i.id} data-testid="site-item" className={`gm-card ${i.soldOut ? "opacity-60" : ""}`}>
                    <Link href={p.view.path(`/item/${i.id}`)} className="flex items-center justify-between gap-3 p-3">
                      <span className="font-bold">{tx(i.name)}</span>
                      <span className="rounded bg-black px-2 py-1 text-sm font-black text-[#ffe14d]">{i.soldOut ? p.s.soldOut : priceLabel(i, p)}</span>
                    </Link>
                  </li>
                )
                : <MenuItem key={i.id} p={p} item={i} style={data.website.menu_style} />))}
            </ul>
          </section>
        ))}
        <Gallery p={p} />
        <Branches p={p} />
        <Contact p={p} />
        <Footer p={p} />
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-black bg-[#ffe14d] p-3">
        <div className="mx-auto flex max-w-3xl justify-center"><Actions p={p} className="justify-center" /></div>
      </div>
    </div>
  );
}
