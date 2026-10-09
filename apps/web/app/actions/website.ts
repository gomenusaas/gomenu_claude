"use server";

import { refreshRestaurant } from "@/lib/site/revalidate";
import { dbError, type FormState } from "@/components/form-state";
import type { Database } from "@/lib/database.types";
import { getDomainProvider } from "@/lib/domains/provider";
import { syncDomain } from "@/lib/domains/sync";
import { getDictionary } from "@/lib/i18n";
import { i18nFromForm } from "@/lib/i18n/text";
import { createClient } from "@/lib/supabase/server";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const on = (fd: FormData, k: string) => fd.get(k) === "on";

export async function saveWebsite(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const restaurantId = s(fd, "restaurant_id");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("website_settings").update({
    menu_style: s(fd, "menu_style") as Database["public"]["Enums"]["menu_display_style"],
    show_gallery: on(fd, "show_gallery"), show_branches: on(fd, "show_branches"),
    show_hours: on(fd, "show_hours"), show_whatsapp: on(fd, "show_whatsapp"),
    ordering_enabled: on(fd, "ordering_enabled"), online_payment_enabled: on(fd, "online_payment_enabled"),
    seo_title: i18nFromForm(fd, "seo_title"), seo_description: i18nFromForm(fd, "seo_description"),
    is_published: on(fd, "is_published"), updated_by: auth.user?.id,
  }).eq("restaurant_id", restaurantId).select("restaurant_id");
  if (error) return dbError(error, t.security.reauthPrompt);
  if (!data?.length) return { error: t.common.unexpectedError };
  refreshRestaurant(restaurantId);
  return { ok: t.common.saved };
}

export async function changeSlug(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const restaurantId = s(fd, "restaurant_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_restaurant_slug", { p_restaurant_id: restaurantId, p_new_slug: s(fd, "slug") });
  if (error) return error.code === "23505" ? { error: t.onboarding.slugTaken } : dbError(error, t.security.reauthPrompt);
  refreshRestaurant(restaurantId);
  return { ok: t.common.saved };
}

export async function addDomain(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const restaurantId = s(fd, "restaurant_id");
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("add_custom_domain", { p_restaurant_id: restaurantId, p_hostname: s(fd, "hostname") });
  if (error) return error.code === "23514" && /hostname/.test(error.message) ? { error: t.website.hostnameInvalid } : dbError(error, t.security.reauthPrompt);
  const { data: domain } = await supabase.from("restaurant_domains").select("id, hostname").eq("id", id).single();
  if (domain) await syncDomain(domain, "add");
  refreshRestaurant(restaurantId);
  return { ok: t.common.saved };
}

/** RLS decides who may see the domain; only then is its status refreshed with the service role. */
export async function checkDomain(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const restaurantId = s(fd, "restaurant_id");
  const supabase = await createClient();
  const { data: domain } = await supabase.from("restaurant_domains").select("id, hostname").eq("id", s(fd, "id")).maybeSingle();
  if (!domain) return { error: t.common.unexpectedError };
  await syncDomain(domain);
  refreshRestaurant(restaurantId);
  return undefined;
}

export async function removeDomain(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const restaurantId = s(fd, "restaurant_id");
  const supabase = await createClient();
  const { data: hostname, error } = await supabase.rpc("remove_custom_domain", { p_domain_id: s(fd, "id") });
  if (error) return dbError(error, t.security.reauthPrompt);
  try {
    await (await getDomainProvider()).remove(hostname);
  } catch (e) {
    console.error("domain removal at provider failed", hostname, e);
  }
  refreshRestaurant(restaurantId);
  return undefined;
}

export async function makePrimaryDomain(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const restaurantId = s(fd, "restaurant_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_primary_domain", { p_domain_id: s(fd, "id") });
  if (error) return dbError(error, t.security.reauthPrompt);
  refreshRestaurant(restaurantId);
  return undefined;
}
