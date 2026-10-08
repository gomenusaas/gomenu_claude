"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/form-state";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

// Every platform action is authorised (role + MFA) and audited inside the database RPC.
type Fn = keyof Database["public"]["Functions"];

async function call(fn: Fn, args: Record<string, unknown>, path: string, ok = "Saved."): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn as never, args as never);
  if (error) return { error: error.message };
  revalidatePath(path, "layout");
  return { ok };
}

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const toMinor = (v: string) => Math.round(Number(v) * 100); // billing currency USD (2 decimals)

export async function recordPayment(_: FormState, fd: FormData): Promise<FormState> {
  const result = await call("platform_record_payment", {
    p_invoice_id: s(fd, "invoice_id"),
    p_amount_minor: Number(s(fd, "amount_minor")),
    p_method: s(fd, "method"),
    p_reference: s(fd, "reference"),
  }, "/platform");
  if (result?.error) return result;
  // The invoice leaves the "open" list, so confirm on the page itself.
  redirect(`/platform/invoices?status=paid&notice=${encodeURIComponent(s(fd, "number"))}`);
}

export async function voidInvoice(_: FormState, fd: FormData) {
  return call("platform_void_invoice", { p_invoice_id: s(fd, "invoice_id"), p_reason: s(fd, "reason") }, "/platform", "Invoice voided.");
}

export async function setPrice(_: FormState, fd: FormData) {
  return call("platform_set_price", {
    p_item_type: s(fd, "item_type"),
    p_plan_key: s(fd, "plan_key") || null,
    p_amount_minor: toMinor(s(fd, "amount")),
  }, "/platform/plans", "New price saved. Existing invoices keep their price.");
}

export async function setPlanEntitlements(_: FormState, fd: FormData): Promise<FormState> {
  const plan = s(fd, "plan_key");
  const supabase = await createClient();
  for (const key of fd.getAll("feature_key").map(String)) {
    const limitRaw = s(fd, `limit:${key}`);
    const { error } = await supabase.rpc("platform_set_entitlement", {
      p_plan_key: plan,
      p_feature_key: key,
      p_enabled: fd.get(`enabled:${key}`) === "on",
      p_limit_value: limitRaw === "" ? undefined : Number(limitRaw),
    });
    if (error) return { error: `${key}: ${error.message}` };
  }
  revalidatePath("/platform/plans");
  return { ok: "Entitlements saved." };
}

export async function setSetting(_: FormState, fd: FormData) {
  const type = s(fd, "type");
  const raw = s(fd, "value");
  const value = type === "number" ? Number(raw) : raw;
  return call("platform_set_setting", { p_key: s(fd, "key"), p_value: value }, "/platform/settings");
}

export async function grantTrial(_: FormState, fd: FormData) {
  return call("platform_grant_trial", {
    p_restaurant_id: s(fd, "restaurant_id"), p_days: Number(s(fd, "days")), p_reason: s(fd, "reason"),
  }, "/platform/restaurants", "Trial granted.");
}

export async function setHold(_: FormState, fd: FormData) {
  return call("platform_set_hold", {
    p_restaurant_id: s(fd, "restaurant_id"), p_hold: s(fd, "hold") === "true", p_reason: s(fd, "reason"),
  }, "/platform/restaurants", "Updated.");
}

export async function setOverride(_: FormState, fd: FormData) {
  const limitRaw = s(fd, "limit");
  return call("platform_set_restaurant_override", {
    p_restaurant_id: s(fd, "restaurant_id"),
    p_feature_key: s(fd, "feature_key"),
    p_enabled: fd.get("enabled") === "on",
    p_limit_value: limitRaw === "" ? null : Number(limitRaw),
    p_reason: s(fd, "reason"),
    p_expires_at: s(fd, "expires_at") || null,
  }, "/platform/restaurants", "Override saved.");
}

export async function addStaff(_: FormState, fd: FormData) {
  return call("platform_add_staff", { p_email: s(fd, "email"), p_role: s(fd, "role") }, "/platform/staff", "Staff added.");
}

export async function setStaffActive(_: FormState, fd: FormData) {
  return call("platform_set_staff_active", { p_user_id: s(fd, "user_id"), p_active: s(fd, "active") === "true" },
    "/platform/staff", "Updated.");
}
