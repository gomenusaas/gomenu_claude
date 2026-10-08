"use server";

import { revalidatePath } from "next/cache";
import { dbError, type FormState } from "@/components/form-state";
import { zonedLocalToIso } from "@/lib/format";
import { getDictionary } from "@/lib/i18n";
import { toE164 } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (v: string) => (v === "" ? null : Number(v));

function phones(fd: FormData) {
  const phone = s(fd, "phone") ? toE164(s(fd, "phone")) : null;
  const whatsapp = s(fd, "whatsapp") ? toE164(s(fd, "whatsapp")) : null;
  const invalid = (s(fd, "phone") && !phone) || (s(fd, "whatsapp") && !whatsapp);
  return { phone, whatsapp, invalid };
}

/** The branch-limit trigger raises 23514 with a readable message; show it as-is. */
export async function addBranch(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const restaurantId = s(fd, "restaurant_id");
  if (!s(fd, "name")) return { error: t.onboarding.nameRequired };
  const { phone, whatsapp, invalid } = phones(fd);
  if (invalid) return { error: t.login.invalidPhone };
  const supabase = await createClient();
  const { error } = await supabase.from("branches").insert({
    restaurant_id: restaurantId, name: s(fd, "name"), address: s(fd, "address") || null,
    phone_e164: phone, whatsapp_e164: whatsapp,
  });
  if (error) return dbError(error, t.security.reauthPrompt);
  revalidatePath(`/r/${restaurantId}`, "layout");
  return { ok: t.common.saved };
}

export async function saveBranch(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const restaurantId = s(fd, "restaurant_id");
  if (!s(fd, "name")) return { error: t.onboarding.nameRequired };
  const { phone, whatsapp, invalid } = phones(fd);
  if (invalid) return { error: t.login.invalidPhone };
  const maps = s(fd, "maps_url");
  if (maps && !maps.startsWith("https://")) return { error: t.branches.mapsInvalid };
  const supabase = await createClient();
  const { data, error } = await supabase.from("branches").update({
    name: s(fd, "name"), address: s(fd, "address") || null, phone_e164: phone, whatsapp_e164: whatsapp,
    maps_url: maps || null, latitude: num(s(fd, "latitude")), longitude: num(s(fd, "longitude")),
  }).eq("id", s(fd, "branch_id")).select("id");
  if (error) return dbError(error, t.security.reauthPrompt);
  if (!data?.length) return { error: t.common.unexpectedError };
  revalidatePath(`/r/${restaurantId}`, "layout");
  return { ok: t.common.saved };
}

/** One opening period per day; a day without the "open" box ticked is closed. */
export async function saveHours(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const restaurantId = s(fd, "restaurant_id");
  const hours: { day: number; opens: string; closes: string }[] = [];
  for (let day = 0; day < 7; day++) {
    if (fd.get(`open:${day}`) !== "on") continue;
    const opens = s(fd, `opens:${day}`);
    const closes = s(fd, `closes:${day}`);
    if (!opens || !closes) return { error: t.branches.hoursInvalid };
    hours.push({ day, opens, closes });
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_branch_hours", { p_branch_id: s(fd, "branch_id"), p_hours: hours });
  if (error) return dbError(error, t.security.reauthPrompt);
  revalidatePath(`/r/${restaurantId}`, "layout");
  return { ok: t.common.saved };
}

export async function saveOverride(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const restaurantId = s(fd, "restaurant_id");
  const mode = s(fd, "status_override") as "auto" | "open" | "closed";
  const until = s(fd, "override_until");
  const supabase = await createClient();
  const { data: r } = await supabase.from("restaurants").select("timezone").eq("id", restaurantId).single();
  const { data, error } = await supabase.from("branches").update({
    status_override: mode,
    override_until: mode === "auto" || !until ? null : zonedLocalToIso(until, r?.timezone ?? "UTC"),
  }).eq("id", s(fd, "branch_id")).select("id");
  if (error) return dbError(error, t.security.reauthPrompt);
  if (!data?.length) return { error: t.common.unexpectedError };
  revalidatePath(`/r/${restaurantId}`, "layout");
  return { ok: t.common.saved };
}

export async function archiveBranch(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const restaurantId = s(fd, "restaurant_id");
  const supabase = await createClient();
  const { data, error } = await supabase.from("branches")
    .update({ is_active: false, archived_at: new Date().toISOString() })
    .eq("id", s(fd, "branch_id")).select("id");
  if (error) return dbError(error, t.security.reauthPrompt);
  if (!data?.length) return { error: t.common.unexpectedError };
  revalidatePath(`/r/${restaurantId}`, "layout");
  return { ok: t.common.saved };
}
