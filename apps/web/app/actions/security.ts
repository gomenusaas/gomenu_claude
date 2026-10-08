"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { dbError, type FormState } from "@/components/form-state";
import { getDeviceToken } from "@/lib/auth/device";
import { open, seal } from "@/lib/crypto";
import { fmt, getDictionary } from "@/lib/i18n";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Remove the Supabase auth cookies WITHOUT revoking the session (it is parked, not ended). */
async function clearAuthCookies() {
  const jar = await cookies();
  for (const c of jar.getAll()) {
    if (c.name.startsWith("sb-") && c.name.includes("-auth-token")) jar.delete(c.name);
  }
}

/**
 * Lock / switch staff (spec §4 shared devices): park this person's session server-side,
 * encrypted, then clear it from the browser. Only a PIN on this trusted device brings it back.
 */
export async function lockScreen() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: sessionData } = await supabase.auth.getSession();
  const token = await getDeviceToken();
  if (!auth.user || !sessionData.session) redirect("/login");
  const { error } = token
    ? await createAdminClient().rpc("park_device_session", {
        p_device_token: token,
        p_user_id: auth.user.id,
        p_ciphertext: seal(sessionData.session.refresh_token),
      })
    : { error: { message: "no device" } };
  if (error) {
    // Device never trusted via OTP (e.g. email + password login): end the session instead.
    await supabase.auth.signOut();
    redirect("/lock?untrusted=1");
  }
  await clearAuthCookies();
  redirect("/lock");
}

export async function unlockWithPin(userId: string, _: FormState, formData: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const token = await getDeviceToken();
  if (!token) return { error: t.security.deviceNotTrusted };
  const { data, error } = await createAdminClient().rpc("pin_unlock", {
    p_device_token: token,
    p_user_id: userId,
    p_pin: String(formData.get("pin") ?? ""),
  });
  if (error) return { error: t.common.unexpectedError };
  const result = data as { ok: boolean; reason?: string; attempts_left?: number; ciphertext?: string };
  if (!result.ok) {
    switch (result.reason) {
      case "wrong_pin": return { error: fmt(t.security.wrongPin, { left: result.attempts_left ?? 0 }) };
      case "locked": return { error: t.security.pinLocked };
      case "no_pin": return { error: t.security.noPin };
      case "no_parked_session": return { error: t.security.sessionExpired };
      default: return { error: t.security.deviceNotTrusted };
    }
  }
  const supabase = await createClient();
  const { error: refreshError } = await supabase.auth.refreshSession({ refresh_token: open(result.ciphertext!) });
  if (refreshError) return { error: t.security.sessionExpired }; // e.g. logged out everywhere
  redirect("/app");
}

export async function logoutAllDevices() {
  const supabase = await createClient();
  await supabase.rpc("logout_all_devices");
  await clearAuthCookies();
  redirect("/login");
}

export async function revokeDevice(formData: FormData) {
  const supabase = await createClient();
  await supabase.rpc("revoke_device", { p_device_id: String(formData.get("device_id")) });
  revalidatePath("/account");
}

export async function setMyPin(_: FormState, formData: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const pin = String(formData.get("pin") ?? "");
  if (pin !== String(formData.get("confirm") ?? "")) return { error: t.pin.mismatch };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_pin", { p_pin: pin });
  if (error) return dbError(error, t.security.reauthPrompt);
  revalidatePath("/account");
  return { ok: t.security.pinSaved };
}
