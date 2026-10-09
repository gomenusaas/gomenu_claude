"use server";

import { refreshRestaurant } from "@/lib/site/revalidate";
import { dbError, type FormState } from "@/components/form-state";
import { getDictionary } from "@/lib/i18n";
import { i18nFromForm } from "@/lib/i18n/text";
import type { UploadedMedia } from "@/lib/media/types";
import { createClient } from "@/lib/supabase/server";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Called by the upload component after the file is in storage under {restaurant}/gallery/. */
export async function addGalleryMedia(restaurantId: string, m: UploadedMedia): Promise<FormState> {
  const { t } = await getDictionary();
  const supabase = await createClient();
  const { error } = await supabase.from("gallery_media").insert({
    restaurant_id: restaurantId, kind: m.kind, storage_path: m.path, poster_path: m.posterPath,
    width: m.width, height: m.height, bytes: m.bytes, sort: Date.now() % 1_000_000,
  });
  if (error) {
    await supabase.storage.from("restaurant-public").remove([m.path, ...(m.posterPath ? [m.posterPath] : [])]);
    return dbError(error, t.security.reauthPrompt);
  }
  refreshRestaurant(restaurantId);
  return undefined;
}

export async function saveGalleryMedia(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const restaurantId = s(fd, "restaurant_id");
  const supabase = await createClient();
  const { data, error } = await supabase.from("gallery_media")
    .update({ caption: i18nFromForm(fd, "caption"), is_active: fd.get("is_active") === "on" })
    .eq("id", s(fd, "id")).select("id");
  if (error) return dbError(error, t.security.reauthPrompt);
  if (!data?.length) return { error: t.common.unexpectedError };
  refreshRestaurant(restaurantId);
  return { ok: t.common.saved };
}

export async function removeGalleryMedia(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const restaurantId = s(fd, "restaurant_id");
  const supabase = await createClient();
  const { data, error } = await supabase.from("gallery_media").delete().eq("id", s(fd, "id")).select("storage_path, poster_path");
  if (error) return dbError(error, t.security.reauthPrompt);
  const paths = (data ?? []).flatMap((m) => [m.storage_path, m.poster_path].filter(Boolean) as string[]);
  if (paths.length) await supabase.storage.from("restaurant-public").remove(paths);
  refreshRestaurant(restaurantId);
  return undefined;
}
