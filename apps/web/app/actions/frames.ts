"use server";

import { dbError, type FormState } from "@/components/form-state";
import { getDictionary } from "@/lib/i18n";
import type { UploadedMedia } from "@/lib/media/types";
import { refreshRestaurant } from "@/lib/site/revalidate";
import { createClient } from "@/lib/supabase/server";

/** Publish a Frame whose media is already in storage under {restaurant}/frames/. Live for 24 h. */
export async function publishFrame(input: {
  restaurantId: string; media: UploadedMedia; caption: Record<string, string>; itemId: string | null; branchIds: string[];
}): Promise<FormState> {
  const { t } = await getDictionary();
  const supabase = await createClient();
  const cleanup = () => supabase.storage.from("restaurant-public")
    .remove([input.media.path, ...(input.media.posterPath ? [input.media.posterPath] : [])]);
  const caption = Object.fromEntries(Object.entries(input.caption).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]));
  const { data, error } = await supabase.from("frames").insert({
    restaurant_id: input.restaurantId, kind: input.media.kind, media_path: input.media.path, poster_path: input.media.posterPath,
    caption, item_id: input.itemId || null,
  } as never).select("id").single();
  if (error) {
    await cleanup();
    return dbError(error, t.security.reauthPrompt);
  }
  if (input.branchIds.length) {
    const { error: bError } = await supabase.from("frame_branches")
      .insert(input.branchIds.map((branch_id) => ({ frame_id: data.id, branch_id, restaurant_id: input.restaurantId })));
    if (bError) return dbError(bError, t.security.reauthPrompt);
  }
  refreshRestaurant(input.restaurantId);
  return { ok: t.common.saved };
}

/** Take a Frame down before its 24 hours are up. */
export async function removeFrame(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const supabase = await createClient();
  const { error } = await supabase.from("frames").update({ archived_at: new Date().toISOString() }).eq("id", String(fd.get("id")));
  if (error) return dbError(error, t.security.reauthPrompt);
  refreshRestaurant(String(fd.get("restaurant_id")));
  return undefined;
}
