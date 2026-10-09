"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/form-state";
import { getDictionary } from "@/lib/i18n";
import { toE164 } from "@/lib/phone";
import { afterOtpLogin } from "@/lib/auth/device";
import { createClient } from "@/lib/supabase/server";

/** Mobile + OTP: used for registration and login (owners, staff and diners share one identity). */
export async function sendPhoneOtp(_: FormState, formData: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const phone = toE164(String(formData.get("phone") ?? ""));
  if (!phone) return { error: t.login.invalidPhone };
  const fullName = String(formData.get("full_name") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    phone,
    options: fullName ? { data: { full_name: fullName } } : undefined,
  });
  if (error) return { error: error.status === 429 ? t.login.tooMany : t.common.unexpectedError };
  const next = safeNext(String(formData.get("next") ?? ""));
  redirect(`/verify?phone=${encodeURIComponent(phone)}${next ? `&next=${encodeURIComponent(next)}` : ""}`);
}

export async function verifyPhoneOtp(_: FormState, formData: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const phone = toE164(String(formData.get("phone") ?? ""));
  const token = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (!phone || token.length !== 6) return { error: t.verify.invalidCode };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
  if (error) return { error: error.status === 429 ? t.login.tooMany : t.verify.invalidCode };
  await afterOtpLogin();
  redirect(safeNext(String(formData.get("next") ?? "")) ?? "/app");
}

export async function loginWithEmail(_: FormState, formData: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
  if (error) return { error: error.status === 429 ? t.login.tooMany : t.login.invalidCredentials };
  await supabase.rpc("record_auth_event", { p_action: "auth.login_password" });
  redirect("/app");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.rpc("record_auth_event", { p_action: "auth.logout" });
  await supabase.auth.signOut();
  redirect("/");
}

/** Only same-site relative paths are allowed as post-login destinations. */
function safeNext(next: string): string | null {
  return next.startsWith("/") && !next.startsWith("//") ? next : null;
}

/** Re-authentication (decision P3-Q6): a fresh OTP to the person's own verified number. */
export async function sendReauthOtp(): Promise<FormState> {
  const { t } = await getDictionary();
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_my_context");
  const phone = (data as { phone_e164?: string } | null)?.phone_e164;
  if (!phone) return { error: t.login.invalidPhone };
  const { error } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: false } });
  if (error) return { error: error.status === 429 ? t.login.tooMany : t.common.unexpectedError };
  return { ok: "sent" };
}
