"use server";

import { refreshRestaurant } from "@/lib/site/revalidate";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/form-state";
import { getDictionary } from "@/lib/i18n";
import { toE164 } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

// Direct table updates: RLS (settings.manage / branches.manage) and the lifecycle write guard
// decide whether they are allowed.

export async function saveDetails(_: FormState, formData: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const restaurantId = String(formData.get("restaurant_id"));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("restaurants")
    .update({
      name: String(formData.get("name") ?? "").trim(),
      default_locale: formData.get("default_locale") === "ar" ? "ar" : "en",
    })
    .eq("id", restaurantId)
    .select("id");
  if (error || !data?.length) return { error: error?.message ?? t.common.unexpectedError };
  refreshRestaurant(restaurantId);
  return { ok: t.common.saved };
}

export async function saveBranch(_: FormState, formData: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const restaurantId = String(formData.get("restaurant_id"));
  const phone = toE164(String(formData.get("phone") ?? ""));
  if (!phone) return { error: t.login.invalidPhone };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("branches")
    .update({
      name: String(formData.get("name") ?? "").trim(),
      address: String(formData.get("address") ?? "").trim() || null,
      phone_e164: phone,
    })
    .eq("id", String(formData.get("branch_id")))
    .select("id");
  if (error || !data?.length) return { error: error?.message ?? t.common.unexpectedError };
  refreshRestaurant(restaurantId);
  return { ok: t.common.saved };
}

export async function finishSetup(formData: FormData) {
  const restaurantId = String(formData.get("restaurant_id"));
  const supabase = await createClient();
  await supabase.rpc("complete_onboarding", { p_restaurant_id: restaurantId });
  redirect(`/r/${restaurantId}`);
}
