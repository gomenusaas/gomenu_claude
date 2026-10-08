"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/form-state";
import { createClient } from "@/lib/supabase/server";

export async function platformLogin(_: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
  if (error) return { error: "Email or password is incorrect." };
  redirect("/platform/mfa");
}

export type EnrollState = { error?: string; factorId?: string; qr?: string; secret?: string } | undefined;

/** Start authenticator enrolment (removes any half-finished enrolment first). */
export async function startEnrollment(): Promise<EnrollState> {
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "GoMenu platform" });
  if (error) return { error: error.message };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Verify a TOTP code; on success the session is upgraded to aal2. */
export async function verifyTotp(_: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const factorId = String(formData.get("factor_id"));
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: "That code is incorrect. Check your authenticator app and try again." };
  redirect("/platform");
}
