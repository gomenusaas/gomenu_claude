"use server";

import { refreshRestaurant } from "@/lib/site/revalidate";
import type { FormState } from "@/components/form-state";
import { createClient } from "@/lib/supabase/server";

// Thin wrappers: authorization, pricing and proration all happen in the database RPCs.

export async function choosePlan(_: FormState, formData: FormData): Promise<FormState> {
  const restaurantId = String(formData.get("restaurant_id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("choose_plan", {
    p_restaurant_id: restaurantId,
    p_plan_key: String(formData.get("plan_key")),
    p_extra_branches: Number(formData.get("extra_branches") ?? 0) || 0,
  });
  if (error) return { error: error.message };
  refreshRestaurant(restaurantId);
  return { ok: "ok" };
}

export async function buyExtraBranches(_: FormState, formData: FormData): Promise<FormState> {
  const restaurantId = String(formData.get("restaurant_id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("buy_extra_branches", {
    p_restaurant_id: restaurantId,
    p_count: Number(formData.get("count") ?? 1) || 1,
  });
  if (error) return { error: error.message };
  refreshRestaurant(restaurantId);
  return { ok: "ok" };
}

export async function upgradePlan(_: FormState, formData: FormData): Promise<FormState> {
  const restaurantId = String(formData.get("restaurant_id"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("upgrade_plan", { p_restaurant_id: restaurantId, p_plan_key: "gold" });
  if (error) return { error: error.message };
  refreshRestaurant(restaurantId);
  return { ok: "ok" };
}
