"use server";

import { revalidatePath } from "next/cache";
import { dbError, type FormState } from "@/components/form-state";
import { getDictionary } from "@/lib/i18n";
import { toE164 } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Collect per-language fields named `${prefix}:${locale}` into {"en": "...", "ar": "..."}. */
function i18n(fd: FormData, prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of fd.entries()) {
    if (key.startsWith(`${prefix}:`) && String(value).trim()) out[key.slice(prefix.length + 1)] = String(value).trim();
  }
  return out;
}

export async function saveProfile(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const id = s(fd, "restaurant_id");
  const phone = s(fd, "contact_phone") ? toE164(s(fd, "contact_phone")) : null;
  const whatsapp = s(fd, "whatsapp") ? toE164(s(fd, "whatsapp")) : null;
  if ((s(fd, "contact_phone") && !phone) || (s(fd, "whatsapp") && !whatsapp)) return { error: t.login.invalidPhone };
  const social: Record<string, string> = {};
  for (const k of ["instagram", "tiktok", "x", "facebook", "snapchat"]) if (s(fd, `social:${k}`)) social[k] = s(fd, `social:${k}`);
  const supabase = await createClient();
  const { data, error } = await supabase.from("restaurants").update({
    tagline: i18n(fd, "tagline"),
    description: i18n(fd, "description"),
    contact_phone_e164: phone,
    whatsapp_e164: whatsapp,
    contact_email: s(fd, "contact_email") || null,
    social_links: social,
    timezone: s(fd, "timezone") || "Asia/Muscat",
    invite_ttl_hours: Number(s(fd, "invite_ttl_hours")) || 48,
  }).eq("id", id).select("id");
  if (error || !data?.length) return { error: error?.message ?? t.common.unexpectedError };
  revalidatePath(`/r/${id}`, "layout");
  return { ok: t.common.saved };
}

export async function setBrandImage(restaurantId: string, kind: "logo" | "cover", path: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.from("restaurants")
    .update(kind === "logo" ? { logo_path: path } : { cover_path: path }).eq("id", restaurantId);
  return error ? { error: error.message } : undefined;
}

export async function saveLanguages(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const id = s(fd, "restaurant_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_restaurant_languages", { p_restaurant_id: id, p_locales: fd.getAll("locales").map(String) });
  if (error) return { error: error.message };
  revalidatePath(`/r/${id}`, "layout");
  return { ok: t.common.saved };
}

export async function saveSecurity(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const id = s(fd, "restaurant_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_security_settings", {
    p_restaurant_id: id, p_auto_lock_minutes: Number(s(fd, "auto_lock")) || 5,
  });
  if (error) return dbError(error, t.security.reauthPrompt);
  revalidatePath(`/r/${id}`, "layout");
  return { ok: t.common.saved };
}
