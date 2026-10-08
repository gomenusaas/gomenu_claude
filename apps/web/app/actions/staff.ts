"use server";

import { revalidatePath } from "next/cache";
import { dbError, type FormState } from "@/components/form-state";
import { getDictionary } from "@/lib/i18n";
import { toE164 } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

// Every action below is authorised by the database function it calls; the UI hiding a
// button is never the check.

export async function inviteStaff(_: FormState, formData: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const restaurantId = String(formData.get("restaurant_id"));
  const phone = toE164(String(formData.get("phone") ?? ""));
  if (!phone) return { error: t.login.invalidPhone };
  const branch = String(formData.get("intended_branch_id") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.rpc("invite_staff", {
    p_restaurant_id: restaurantId,
    p_full_name: String(formData.get("full_name") ?? ""),
    p_phone_e164: phone,
    p_intended_branch_id: branch || undefined,
  });
  if (error) return { error: error.message };
  revalidatePath(`/r/${restaurantId}/staff`);
  return { ok: t.staff.invited };
}

export async function resendInvitation(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("resend_staff_invitation", {
    p_membership_id: String(formData.get("membership_id")),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/r/${formData.get("restaurant_id")}/staff`);
}

export async function cancelInvitation(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_staff_invitation", {
    p_membership_id: String(formData.get("membership_id")),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/r/${formData.get("restaurant_id")}/staff`);
}

export async function assignRole(_: FormState, formData: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const scope = formData.get("branch_scope") === "all" ? "all" : "selected";
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_staff_role", {
    p_membership_id: String(formData.get("membership_id")),
    p_role_id: String(formData.get("role_id")),
    p_branch_scope: scope,
    p_branch_ids: scope === "selected" ? formData.getAll("branch_ids").map(String) : [],
  });
  if (error) return dbError(error, t.security.reauthPrompt);
  revalidatePath(`/r/${formData.get("restaurant_id")}/staff`);
  return { ok: t.staff.saved };
}

export async function setStaffStatus(_: FormState, formData: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_staff_status", {
    p_membership_id: String(formData.get("membership_id")),
    p_status: String(formData.get("status")) as "active" | "disabled" | "locked" | "removed",
    p_reason: String(formData.get("reason") ?? ""),
  });
  if (error) return dbError(error, t.security.reauthPrompt);
  revalidatePath(`/r/${formData.get("restaurant_id")}/staff`);
  return { ok: t.staff.saved };
}

export async function changeStaffPhone(_: FormState, formData: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const phone = toE164(String(formData.get("phone") ?? ""));
  if (!phone) return { error: t.login.invalidPhone };
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_staff_phone", {
    p_membership_id: String(formData.get("membership_id")),
    p_new_phone: phone,
    p_reason: String(formData.get("reason") ?? ""),
  });
  if (error) return dbError(error, t.security.reauthPrompt);
  revalidatePath(`/r/${formData.get("restaurant_id")}/staff`);
  return { ok: t.staff.saved };
}

export async function resetStaffPin(_: FormState, formData: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const supabase = await createClient();
  const { error } = await supabase.rpc("reset_staff_pin", {
    p_membership_id: String(formData.get("membership_id")),
    p_reason: String(formData.get("reason") ?? ""),
  });
  if (error) return dbError(error, t.security.reauthPrompt);
  return { ok: t.staff.saved };
}
