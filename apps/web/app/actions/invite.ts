"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/form-state";
import { getDictionary } from "@/lib/i18n";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * The invited number is resolved on the server from the token (service-role-only RPC).
 * The browser never supplies or sees the full number, so a forwarded link sends the OTP to
 * the original invitee and grants nothing to whoever opened it.
 */
async function invitedPhone(token: string): Promise<string | null> {
  const { data, error } = await createAdminClient().rpc("open_invitation", { p_token: token });
  return error ? null : (data as string);
}

export async function sendInvitationOtp(token: string): Promise<FormState> {
  const { t } = await getDictionary();
  const phone = await invitedPhone(token);
  if (!phone) return { error: t.invite.invalid };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) return { error: error.status === 429 ? t.login.tooMany : t.common.unexpectedError };
  redirect(`/invite/${encodeURIComponent(token)}/verify`);
}

export async function verifyInvitationOtp(token: string, _: FormState, formData: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const phone = await invitedPhone(token);
  if (!phone) return { error: t.invite.invalid };
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: "sms" });
  if (error) return { error: error.status === 429 ? t.login.tooMany : t.verify.invalidCode };

  const accepted = await supabase.rpc("accept_staff_invitation", { p_token: token });
  if (accepted.error) {
    return { error: accepted.error.code === "42501" ? t.invite.wrongNumber : accepted.error.message };
  }
  redirect("/pending");
}

export async function setStaffPin(_: FormState, formData: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const pin = String(formData.get("pin") ?? "");
  const confirm = formData.get("confirm");
  if (!/^\d{6}$/.test(pin)) return { error: t.pin.format };
  if (confirm !== null && confirm !== pin) return { error: t.pin.mismatch };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("complete_staff_verification", {
    p_membership_id: String(formData.get("membership_id")),
    p_pin: pin,
  });
  if (error) {
    if (error.message.includes("predictable")) return { error: t.pin.weak };
    if (error.message.includes("too many")) return { error: t.pin.locked };
    return { error: t.common.unexpectedError };
  }
  if (data === false) return { error: t.pin.wrong };
  redirect("/pending");
}
