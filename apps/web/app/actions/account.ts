"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/form-state";
import { getDictionary } from "@/lib/i18n";
import { toE164 } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

export async function updateName(_: FormState, formData: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: String(formData.get("full_name") ?? "").trim() || null })
    .eq("id", data.user.id);
  if (error) return { error: t.common.unexpectedError };
  revalidatePath("/account");
  return { ok: t.common.saved };
}

/** For accounts without a verified phone: add one (OTP to the new number). */
export async function addPhone(_: FormState, formData: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const phone = toE164(String(formData.get("phone") ?? ""));
  if (!phone) return { error: t.login.invalidPhone };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ phone });
  if (error) return { error: error.status === 429 ? t.login.tooMany : error.message };
  redirect(`/account/phone?phone=${encodeURIComponent(phone)}`);
}

export async function verifyAddedPhone(_: FormState, formData: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const phone = toE164(String(formData.get("phone") ?? ""));
  const token = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (!phone) return { error: t.login.invalidPhone };
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "phone_change" });
  if (error) return { error: t.verify.invalidCode };
  redirect("/app");
}
