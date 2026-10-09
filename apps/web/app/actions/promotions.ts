"use server";

import { dbError, type FormState } from "@/components/form-state";
import type { Database } from "@/lib/database.types";
import { zonedLocalToIso } from "@/lib/format";
import { getDictionary } from "@/lib/i18n";
import { i18nFromForm } from "@/lib/i18n/text";
import type { UploadedMedia } from "@/lib/media/types";
import { refreshRestaurant } from "@/lib/site/revalidate";
import { createClient } from "@/lib/supabase/server";

type Kind = Database["public"]["Enums"]["promotion_kind"];
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function setBranches(supabase: Awaited<ReturnType<typeof createClient>>, restaurantId: string, promotionId: string, branchIds: string[]) {
  const { error: delError } = await supabase.from("promotion_branches").delete().eq("promotion_id", promotionId);
  if (delError) return delError;
  if (!branchIds.length) return null;
  const { error } = await supabase.from("promotion_branches")
    .insert(branchIds.map((branch_id) => ({ promotion_id: promotionId, branch_id, restaurant_id: restaurantId })));
  return error;
}

/** Create (no id) or update a promotion from the form. Dates are entered in the restaurant's time zone. */
export async function savePromotion(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const restaurantId = s(fd, "restaurant_id");
  const title = i18nFromForm(fd, "title");
  if (!Object.keys(title).length) return { error: t.menu.nameRequired };
  const supabase = await createClient();
  const { data: r } = await supabase.from("restaurants").select("timezone").eq("id", restaurantId).single();
  const tz = r?.timezone ?? "UTC";
  const starts = s(fd, "starts_at") ? zonedLocalToIso(s(fd, "starts_at"), tz) : new Date().toISOString();
  const ends = s(fd, "ends_at") ? zonedLocalToIso(s(fd, "ends_at"), tz) : null;
  if (ends && ends <= starts) return { error: t.promotions.datesInvalid };
  const values = {
    kind: (s(fd, "kind") || "card") as Kind, title, body: i18nFromForm(fd, "body"),
    item_id: s(fd, "item_id") || null, starts_at: starts, ends_at: ends,
  };
  let id = s(fd, "id");
  if (id) {
    const { data, error } = await supabase.from("promotions").update(values).eq("id", id).select("id");
    if (error) return dbError(error, t.security.reauthPrompt);
    if (!data?.length) return { error: t.common.unexpectedError };
  } else {
    const { data, error } = await supabase.from("promotions").insert({ ...values, restaurant_id: restaurantId }).select("id").single();
    if (error) return dbError(error, t.security.reauthPrompt);
    id = data.id;
  }
  const branchError = await setBranches(supabase, restaurantId, id, fd.getAll("branches").map(String));
  if (branchError) return dbError(branchError, t.security.reauthPrompt);
  refreshRestaurant(restaurantId);
  return { ok: t.common.saved };
}

export async function setPromotionActive(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const supabase = await createClient();
  const { error } = await supabase.from("promotions").update({ is_active: s(fd, "active") === "true" }).eq("id", s(fd, "id"));
  if (error) return dbError(error, t.security.reauthPrompt);
  refreshRestaurant(s(fd, "restaurant_id"));
  return undefined;
}

export async function archivePromotion(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const supabase = await createClient();
  const { error } = await supabase.from("promotions").update({ archived_at: new Date().toISOString(), is_active: false }).eq("id", s(fd, "id"));
  if (error) return dbError(error, t.security.reauthPrompt);
  refreshRestaurant(s(fd, "restaurant_id"));
  return undefined;
}

/** Called by the upload component once the image is stored under {restaurant}/promotions/. */
export async function setPromotionImage(restaurantId: string, promotionId: string, m: UploadedMedia): Promise<FormState> {
  const { t } = await getDictionary();
  const supabase = await createClient();
  if (m.kind !== "image") {
    await supabase.storage.from("restaurant-public").remove([m.path]);
    return { error: t.common.unexpectedError };
  }
  const { data: old } = await supabase.from("promotions").select("image_path").eq("id", promotionId).single();
  const { error } = await supabase.from("promotions").update({ image_path: m.path }).eq("id", promotionId);
  if (error) {
    await supabase.storage.from("restaurant-public").remove([m.path]);
    return dbError(error, t.security.reauthPrompt);
  }
  if (old?.image_path) await supabase.storage.from("restaurant-public").remove([old.image_path]);
  refreshRestaurant(restaurantId);
  return undefined;
}
