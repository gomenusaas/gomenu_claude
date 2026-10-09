"use server";

import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

type EventType = Database["public"]["Enums"]["analytics_event_type"];

/** Analytics from the public website. The database validates, rate-limits and flags staff traffic. */
export async function trackEvent(input: {
  restaurantId: string; type: EventType; sessionId: string; entityId?: string | null; branchId?: string | null;
  qrCodeId?: string | null; locale?: string;
}): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("track_event", {
    p_restaurant_id: input.restaurantId, p_event_type: input.type, p_session_id: input.sessionId,
    p_entity_id: input.entityId ?? undefined, p_branch_id: input.branchId ?? undefined,
    p_qr_code_id: input.qrCodeId ?? undefined, p_locale: input.locale,
  });
}

/** Favorite a restaurant (itemId null) or a dish. Returns the new state, or "signin" when signed out. */
export async function toggleFavorite(restaurantId: string, itemId: string | null): Promise<"on" | "off" | "signin" | "error"> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return "signin";
  let query = supabase.from("diner_favorites").select("id").eq("restaurant_id", restaurantId);
  query = itemId ? query.eq("item_id", itemId) : query.is("item_id", null);
  const { data: existing } = await query.maybeSingle();
  if (existing) {
    const { error } = await supabase.from("diner_favorites").delete().eq("id", existing.id);
    return error ? "error" : "off";
  }
  const { error } = await supabase.from("diner_favorites").insert({ user_id: auth.user.id, restaurant_id: restaurantId, item_id: itemId });
  return error ? "error" : "on";
}
