import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "@gomenu/ui";
import { notFound } from "next/navigation";
import { addGalleryMedia, removeGalleryMedia, saveGalleryMedia } from "@/app/actions/gallery";
import { ActionForm } from "@/components/action-form";
import { MediaUpload } from "@/components/media-upload";
import { RowAction } from "@/components/row-action";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth/context";
import { fmt, getDictionary } from "@/lib/i18n";
import { publicMediaUrl } from "@/lib/media/url";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Gallery" };

export default async function GalleryPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const ctx = await requireUser();
  if (!ctx.active_memberships?.some((m) => m.restaurant_id === restaurantId)) notFound();
  const { t } = await getDictionary();
  const supabase = await createClient();
  const [{ data: perms }, { data: media }, { data: langs }, { data: ent }] = await Promise.all([
    supabase.rpc("my_permissions", { p_restaurant_id: restaurantId }),
    supabase.from("gallery_media").select("*").eq("restaurant_id", restaurantId).order("sort"),
    supabase.from("restaurant_languages").select("locale, platform_languages(name, dir)").eq("restaurant_id", restaurantId).order("sort"),
    supabase.rpc("restaurant_entitlements", { p_restaurant_id: restaurantId }),
  ]);
  if (!(perms ?? []).includes("gallery.manage")) notFound();
  const included = (ent as { features?: Record<string, { enabled: boolean }> } | null)?.features?.gallery?.enabled ?? false;
  const locales = (langs ?? []).map((l) => ({
    code: l.locale,
    name: (l.platform_languages as { name: string } | null)?.name ?? l.locale,
    dir: (l.platform_languages as { dir: string } | null)?.dir ?? "ltr",
  }));

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.gallery.title}</h1>
        <p className="text-muted-foreground">{t.gallery.body}</p>
      </div>
      {!included ? (
        <Card><CardContent className="pt-6"><CardDescription>{t.gallery.notIncluded}</CardDescription></CardContent></Card>
      ) : (
        <>
          <MediaUpload restaurantId={restaurantId} folder="gallery" save={addGalleryMedia.bind(null, restaurantId)} testId="gallery-input"
                       labels={{ upload: t.gallery.add, uploading: t.menu.uploading, videoTooLarge: t.menu.videoTooLarge }} />
          {!media?.length ? <p className="text-sm text-muted-foreground">{t.gallery.empty}</p> : null}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(media ?? []).map((m) => (
              <Card key={m.id} data-testid="gallery-item">
                <CardHeader className="p-0">
                  {m.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={publicMediaUrl(m.storage_path) ?? ""} alt="" loading="lazy" className="aspect-video w-full rounded-t-lg object-cover" />
                  ) : (
                    <video src={publicMediaUrl(m.storage_path) ?? ""} poster={publicMediaUrl(m.poster_path) ?? undefined}
                           preload="none" controls className="aspect-video w-full rounded-t-lg object-cover" />
                  )}
                  <CardTitle as="h2" className="sr-only">{t.gallery.title}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 pt-4">
                  <ActionForm action={saveGalleryMedia}>
                    <input type="hidden" name="restaurant_id" value={restaurantId} />
                    <input type="hidden" name="id" value={m.id} />
                    {locales.map((l) => (
                      <Field key={l.code} id={`caption-${m.id}-${l.code}`} label={fmt(t.gallery.caption, { lang: l.name })}>
                        <Input name={`caption:${l.code}`} dir={l.dir} defaultValue={(m.caption as Record<string, string>)[l.code] ?? ""} />
                      </Field>
                    ))}
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="is_active" defaultChecked={m.is_active} /> {t.menu.visible}
                    </label>
                    <SubmitButton size="sm">{t.common.save}</SubmitButton>
                  </ActionForm>
                  <RowAction action={removeGalleryMedia} fields={{ restaurant_id: restaurantId, id: m.id }} label={t.menu.remove} />
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
