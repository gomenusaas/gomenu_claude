import {
  Actions, Branches, CategoryNav, Contact, Footer, Frames, Gallery, Img, Logo, Menu, OpenBadge, Promotions, type SiteProps, TopBar,
} from "../parts";

/** Classic: cover photo with overlapping logo, then a clear menu. */
export function Classic({ p }: { p: SiteProps }) {
  const { data, tx } = p.view;
  const r = data.restaurant;
  return (
    <>
      <header>
        {r.cover_path ? <Img path={r.cover_path} className="h-48 w-full object-cover md:h-72" eager /> : <div className="gm-placeholder h-32 w-full" />}
        <div className="mx-auto max-w-3xl px-4">
          <div className="-mt-10 flex items-end gap-3">
            {r.logo_path ? <Logo p={p} className="size-20 rounded-full border-4 border-background bg-card" /> : null}
            <div className="pb-1"><OpenBadge p={p} /></div>
          </div>
          <h1 className="mt-2 text-3xl font-bold">{r.name}</h1>
          {tx(r.tagline) ? <p className="mt-1 opacity-80">{tx(r.tagline)}</p> : null}
          <Actions p={p} className="mt-4" />
        </div>
      </header>
      <div className="mx-auto grid max-w-3xl gap-8 pb-4">
        <TopBar p={p} />
        <Frames p={p} />
        <Promotions p={p} layout="cards" />
        <div>
          <CategoryNav p={p} sticky className="bg-background/95 backdrop-blur" />
          <Menu p={p} className="mt-4" />
        </div>
        <Gallery p={p} />
        <Branches p={p} />
        <Contact p={p} />
        <Footer p={p} />
      </div>
    </>
  );
}

/** Minimal: text-first and fast, sticky tabs, no hero image. */
export function Minimal({ p }: { p: SiteProps }) {
  const { data, tx } = p.view;
  const r = data.restaurant;
  return (
    <div className="mx-auto max-w-2xl">
      <TopBar p={p} className="border-b" />
      <header className="grid gap-2 px-4 py-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{r.name}</h1>
        {tx(r.tagline) ? <p className="text-sm opacity-70">{tx(r.tagline)}</p> : null}
        <div className="flex justify-center"><OpenBadge p={p} /></div>
        <Actions p={p} className="justify-center" />
      </header>
      <CategoryNav p={p} sticky className="border-b bg-background" />
      <Menu p={p} className="mt-6" />
      <div className="mt-10 grid gap-8">
        <Frames p={p} />
        <Promotions p={p} layout="banner" />
        <Branches p={p} />
        <Contact p={p} />
        <Footer p={p} />
      </div>
    </div>
  );
}

/** Cards: compact header, offers banner, then photo-led content. */
export function Cards({ p }: { p: SiteProps }) {
  const { data, tx } = p.view;
  const r = data.restaurant;
  return (
    <div className="mx-auto max-w-5xl">
      <TopBar p={p} />
      <header className="mx-4 flex flex-wrap items-center gap-4 rounded-[var(--gm-radius-lg)] bg-card p-4 shadow-sm">
        <Logo p={p} className="size-16 rounded-2xl" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold">{r.name}</h1>
          {tx(r.tagline) ? <p className="text-sm opacity-75">{tx(r.tagline)}</p> : null}
          <div className="mt-1"><OpenBadge p={p} /></div>
        </div>
        <Actions p={p} />
      </header>
      <div className="mt-6 grid gap-8 pb-4">
        <Promotions p={p} layout="banner" />
        <Frames p={p} />
        <CategoryNav p={p} />
        <Menu p={p} />
        <Gallery p={p} />
        <Branches p={p} />
        <Contact p={p} />
        <Footer p={p} />
      </div>
    </div>
  );
}
