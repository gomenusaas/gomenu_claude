import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Label } from "@gomenu/ui";
import { notFound } from "next/navigation";
import { saveLanguages, saveProfile, saveSecurity } from "@/app/actions/settings";
import { ActionForm } from "@/components/action-form";
import { BrandUpload } from "@/components/brand-upload";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth/context";
import { fmt, getDictionary } from "@/lib/i18n";
import { publicMediaUrl } from "@/lib/media/url";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Settings" };

const TIMEZONES = ["Asia/Muscat", "Asia/Dubai", "Asia/Riyadh", "Asia/Qatar", "Asia/Bahrain", "Asia/Kuwait"];

export default async function SettingsPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const ctx = await requireUser();
  if (!ctx.active_memberships?.some((m) => m.restaurant_id === restaurantId)) notFound();
  const { t } = await getDictionary();
  const supabase = await createClient();
  const [{ data: perms }, { data: r }, { data: langs }, { data: active }] = await Promise.all([
    supabase.rpc("my_permissions", { p_restaurant_id: restaurantId }),
    supabase.from("restaurants").select("*").eq("id", restaurantId).single(),
    supabase.from("platform_languages").select("code, name, native_name").eq("is_enabled", true).order("sort"),
    supabase.from("restaurant_languages").select("locale").eq("restaurant_id", restaurantId),
  ]);
  const can = (p: string) => (perms ?? []).includes(p);
  if (!r || !(can("settings.manage") || can("website.manage"))) notFound();
  const activeLocales = (active ?? []).map((l) => l.locale);
  const langName = (code: string) => langs?.find((l) => l.code === code)?.name ?? code;
  const tagline = r.tagline as Record<string, string>;
  const description = r.description as Record<string, string>;
  const social = r.social_links as Record<string, string>;

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t.settings.title}</h1>

      {can("settings.manage") ? (
        <Card>
          <CardHeader><CardTitle as="h2" className="text-base">{t.settings.profile}</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={saveProfile}>
              <input type="hidden" name="restaurant_id" value={restaurantId} />
              {activeLocales.map((loc) => (
                <div key={loc} className="grid gap-4 sm:grid-cols-2">
                  <Field id={`tagline-${loc}`} label={fmt(t.settings.tagline, { lang: langName(loc) })}>
                    <Input name={`tagline:${loc}`} defaultValue={tagline[loc] ?? ""} dir={loc === "ar" ? "rtl" : "ltr"} />
                  </Field>
                  <Field id={`description-${loc}`} label={fmt(t.settings.description, { lang: langName(loc) })}>
                    <Input name={`description:${loc}`} defaultValue={description[loc] ?? ""} dir={loc === "ar" ? "rtl" : "ltr"} />
                  </Field>
                </div>
              ))}
              <div className="grid gap-4 sm:grid-cols-3">
                <Field id="contact_phone" label={t.settings.contactPhone}><Input name="contact_phone" type="tel" dir="ltr" defaultValue={r.contact_phone_e164 ?? ""} /></Field>
                <Field id="whatsapp" label={t.settings.whatsapp}><Input name="whatsapp" type="tel" dir="ltr" defaultValue={r.whatsapp_e164 ?? ""} /></Field>
                <Field id="contact_email" label={t.settings.email}><Input name="contact_email" type="email" dir="ltr" defaultValue={r.contact_email ?? ""} /></Field>
              </div>
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">{t.settings.social}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {["instagram", "tiktok", "x", "facebook", "snapchat"].map((k) => (
                    <Input key={k} name={`social:${k}`} aria-label={k} placeholder={`${k} URL`} dir="ltr" defaultValue={social[k] ?? ""} />
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="timezone">{t.settings.timezone}</Label>
                  <select id="timezone" name="timezone" defaultValue={r.timezone} className="h-11 rounded-md border border-input bg-background px-3">
                    {TIMEZONES.map((tz) => <option key={tz}>{tz}</option>)}
                  </select>
                </div>
                <Field id="invite_ttl_hours" label={t.settings.inviteTtl}>
                  <Input name="invite_ttl_hours" type="number" min={24} max={72} defaultValue={r.invite_ttl_hours} />
                </Field>
              </div>
              <SubmitButton>{t.common.save}</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}

      {can("website.manage") ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card><CardContent>
            <BrandUpload restaurantId={restaurantId} kind="logo" currentUrl={publicMediaUrl(r.logo_path)}
                         labels={{ title: t.settings.logo, upload: t.settings.upload, uploading: t.settings.uploading }} />
          </CardContent></Card>
          <Card><CardContent>
            <BrandUpload restaurantId={restaurantId} kind="cover" currentUrl={publicMediaUrl(r.cover_path)}
                         labels={{ title: t.settings.cover, upload: t.settings.upload, uploading: t.settings.uploading }} />
          </CardContent></Card>
        </div>
      ) : null}

      {can("website.manage") ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">{t.settings.languages}</CardTitle>
            <CardDescription>{t.settings.languagesBody}</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={saveLanguages}>
              <input type="hidden" name="restaurant_id" value={restaurantId} />
              <div className="grid gap-2">
                {(langs ?? []).map((l) => (
                  <label key={l.code} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="locales" value={l.code} defaultChecked={activeLocales.includes(l.code)}
                           disabled={l.code === r.default_locale} />
                    {l.name} · {l.native_name}
                  </label>
                ))}
              </div>
              <SubmitButton size="sm">{t.common.save}</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}

      {can("settings.manage") ? (
        <Card>
          <CardHeader><CardTitle as="h2" className="text-base">{t.settings.security}</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={saveSecurity}>
              <input type="hidden" name="restaurant_id" value={restaurantId} />
              <Field id="auto_lock" label={t.settings.autoLock}>
                <Input name="auto_lock" type="number" min={1} max={120} defaultValue={r.staff_auto_lock_minutes} />
              </Field>
              <SubmitButton size="sm">{t.common.save}</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
