import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@gomenu/ui";
import { notFound } from "next/navigation";
import { removeFrame } from "@/app/actions/frames";
import { FramePublisher } from "@/components/frame-publisher";
import { RowAction } from "@/components/row-action";
import { requireUser } from "@/lib/auth/context";
import { fmt, getDictionary } from "@/lib/i18n";
import { tx } from "@/lib/i18n/text";
import { publicMediaUrl } from "@/lib/media/url";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Frames" };

/** Live until 24 h after publishing (or until removed). Rendered per request. */
function timing(expiresAt: string, archivedAt: string | null) {
  const left = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  return { live: !archivedAt && left > 0, hours: Math.floor(left / 3_600_000), minutes: Math.floor((left % 3_600_000) / 60_000) };
}
export const dynamic = "force-dynamic";

export default async function FramesPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const ctx = await requireUser();
  if (!ctx.active_memberships?.some((m) => m.restaurant_id === restaurantId)) notFound();
  const { locale, t } = await getDictionary();
  const supabase = await createClient();
  const [{ data: perms }, { data: r }, { data: langs }, { data: frames }, { data: items }, { data: branches }, { data: ent }] = await Promise.all([
    supabase.rpc("my_permissions", { p_restaurant_id: restaurantId }),
    supabase.from("restaurants").select("default_locale").eq("id", restaurantId).single(),
    supabase.from("restaurant_languages").select("locale, platform_languages(name, dir)").eq("restaurant_id", restaurantId).order("sort"),
    supabase.from("frames").select("*").eq("restaurant_id", restaurantId).order("published_at", { ascending: false }).limit(30),
    supabase.from("menu_items").select("id, name").eq("restaurant_id", restaurantId).is("archived_at", null).order("sort"),
    supabase.from("branches").select("id, name").eq("restaurant_id", restaurantId).is("archived_at", null).order("sort"),
    supabase.rpc("restaurant_entitlements", { p_restaurant_id: restaurantId }),
  ]);
  const can = (p: string) => (perms ?? []).includes(p);
  if (!r || !can("frames.manage")) notFound();
  const included = (ent as { features?: Record<string, { enabled: boolean }> } | null)?.features?.frames?.enabled ?? false;
  const locales = (langs ?? []).map((l) => ({
    code: l.locale, name: (l.platform_languages as { name: string } | null)?.name ?? l.locale,
    dir: (l.platform_languages as { dir: string } | null)?.dir ?? "ltr",
  }));
  const stats = new Map<string, { views: number; completions: number; clicks: number }>();
  if (can("analytics.view") && frames?.length) {
    const { data: events } = await supabase.from("analytics_events").select("entity_id, event_type").eq("restaurant_id", restaurantId)
      .eq("is_internal", false).in("event_type", ["frame_view", "frame_complete", "frame_click"]).in("entity_id", frames.map((f) => f.id));
    for (const e of events ?? []) {
      const s = stats.get(e.entity_id!) ?? { views: 0, completions: 0, clicks: 0 };
      if (e.event_type === "frame_view") s.views++; else if (e.event_type === "frame_complete") s.completions++; else s.clicks++;
      stats.set(e.entity_id!, s);
    }
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.frames.title}</h1>
        <p className="text-muted-foreground">{t.frames.body}</p>
      </div>
      {!included ? (
        <Card><CardContent className="pt-6"><CardDescription>{t.frames.notIncluded}</CardDescription></CardContent></Card>
      ) : (
        <Card>
          <CardHeader><CardTitle as="h2" className="text-base">{t.frames.publish}</CardTitle></CardHeader>
          <CardContent>
            <FramePublisher restaurantId={restaurantId} locales={locales} branches={branches ?? []}
                            items={(items ?? []).map((i) => ({ id: i.id, name: tx(i.name, locale, r.default_locale) }))}
                            labels={{ file: t.frames.file, caption: t.frames.caption, item: t.frames.item, noItem: t.promotions.noItem,
                                      branches: t.frames.branches, publish: t.frames.publish, publishing: t.frames.publishing,
                                      videoTooLarge: t.menu.videoTooLarge }} />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle as="h2" className="text-base">{t.frames.history}</CardTitle></CardHeader>
        <CardContent>
          {!frames?.length ? <p className="text-sm text-muted-foreground">{t.frames.empty}</p> : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {frames.map((f) => {
                const { live, hours, minutes } = timing(f.expires_at, f.archived_at);
                const st = stats.get(f.id) ?? { views: 0, completions: 0, clicks: 0 };
                return (
                  <li key={f.id} className="flex gap-3 rounded-md border p-3" data-testid="frame-row">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={publicMediaUrl(f.poster_path ?? (f.kind === "image" ? f.media_path : null)) ?? ""} alt=""
                         className="size-20 shrink-0 rounded-md bg-muted object-cover" />
                    <div className="grid content-start gap-1 text-sm">
                      <span className="flex items-center gap-2">
                        <Badge tone={live ? "success" : "neutral"} data-testid="frame-status">{live ? t.frames.live : t.frames.expired}</Badge>
                        {live ? <span className="text-xs text-muted-foreground">
                          {fmt(t.frames.expiresIn, { h: hours, m: minutes })}</span> : null}
                      </span>
                      <span>{tx(f.caption, locale, r.default_locale)}</span>
                      {can("analytics.view") ? <span className="text-xs text-muted-foreground">
                        {fmt(t.frames.stats, { views: st.views, completions: st.completions, clicks: st.clicks })}</span> : null}
                      {live ? <div><RowAction action={removeFrame} fields={{ restaurant_id: restaurantId, id: f.id }} label={t.frames.remove} /></div> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
