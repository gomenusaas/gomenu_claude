"use server";

import { refreshRestaurant } from "@/lib/site/revalidate";
import { redirect } from "next/navigation";
import { dbError, type FormState } from "@/components/form-state";
import type { Database } from "@/lib/database.types";
import type { UploadedMedia } from "@/lib/media/types";
import { toMinor } from "@/lib/format";
import { getDictionary } from "@/lib/i18n";
import { i18nFromForm, markEdited } from "@/lib/i18n/text";
import { createClient } from "@/lib/supabase/server";

type Allergen = Database["public"]["Enums"]["allergen"];
type DietaryTag = Database["public"]["Enums"]["dietary_tag"];
type MenuTable = "menu_categories" | "menu_items" | "menu_item_variants" | "menu_option_groups" | "menu_options";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const now = () => new Date().toISOString();

async function ctx(fd: FormData) {
  const { t } = await getDictionary();
  const restaurantId = s(fd, "restaurant_id");
  const supabase = await createClient();
  return { t, restaurantId, supabase };
}

async function currencyOf(supabase: Awaited<ReturnType<typeof createClient>>, restaurantId: string) {
  const { data } = await supabase.from("restaurants").select("currency").eq("id", restaurantId).single();
  return data?.currency ?? "OMR";
}

function done(restaurantId: string, ok: string): FormState {
  refreshRestaurant(restaurantId);
  return { ok };
}

/** Update one row; RLS hides rows the caller may not edit, which shows up as zero rows changed. */
async function update(fd: FormData, table: MenuTable, values: Record<string, unknown>): Promise<FormState> {
  const { t, restaurantId, supabase } = await ctx(fd);
  const { data, error } = await supabase.from(table as "menu_items").update(values as never).eq("id", s(fd, "id")).select("id");
  if (error) return dbError(error, t.security.reauthPrompt);
  if (!data?.length) return { error: t.common.unexpectedError };
  return done(restaurantId, t.common.saved);
}

// --- Categories ------------------------------------------------------------------------------

export async function createCategory(_: FormState, fd: FormData): Promise<FormState> {
  const { t, restaurantId, supabase } = await ctx(fd);
  const name = i18nFromForm(fd, "name");
  if (!Object.keys(name).length) return { error: t.menu.nameRequired };
  const { data: last } = await supabase.from("menu_categories").select("sort").eq("restaurant_id", restaurantId)
    .order("sort", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("menu_categories")
    .insert({ restaurant_id: restaurantId, name, sort: (last?.sort ?? 0) + 10 });
  if (error) return dbError(error, t.security.reauthPrompt);
  return done(restaurantId, t.common.saved);
}

export async function saveCategory(_: FormState, fd: FormData): Promise<FormState> {
  const { t, supabase } = await ctx(fd);
  const name = i18nFromForm(fd, "name");
  if (!Object.keys(name).length) return { error: t.menu.nameRequired };
  const { data: row } = await supabase.from("menu_categories").select("name, i18n_meta").eq("id", s(fd, "id")).single();
  return update(fd, "menu_categories", { name, is_active: fd.get("is_active") === "on", i18n_meta: markEdited(row?.i18n_meta, row?.name, name) });
}

/** Archive (never delete): orders in later phases keep pointing at archived rows. */
export async function archiveRow(_: FormState, fd: FormData): Promise<FormState> {
  const table = s(fd, "table") as MenuTable;
  if (!["menu_categories", "menu_items", "menu_item_variants", "menu_option_groups", "menu_options"].includes(table)) {
    return { error: "invalid" };
  }
  return update(fd, table, { archived_at: now() });
}

/** Move a category or item one place up/down among its siblings, renumbering sort by tens. */
export async function moveRow(_: FormState, fd: FormData): Promise<FormState> {
  const { t, restaurantId, supabase } = await ctx(fd);
  const table = s(fd, "table") === "menu_items" ? "menu_items" : "menu_categories";
  const id = s(fd, "id");
  let query = supabase.from(table as "menu_items").select("id").eq("restaurant_id", restaurantId).is("archived_at", null);
  if (table === "menu_items") {
    const { data: item } = await supabase.from("menu_items").select("category_id").eq("id", id).single();
    query = query.eq("category_id", item?.category_id ?? "");
  }
  const { data: rows } = await query.order("sort").order("created_at");
  const ids = (rows ?? []).map((r) => r.id);
  const i = ids.indexOf(id);
  const j = s(fd, "dir") === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return undefined;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  for (const [index, rowId] of ids.entries()) {
    const { error } = await supabase.from(table as "menu_items").update({ sort: (index + 1) * 10 }).eq("id", rowId);
    if (error) return dbError(error, t.security.reauthPrompt);
  }
  return done(restaurantId, "ok");
}

// --- Items -----------------------------------------------------------------------------------

export async function createItem(_: FormState, fd: FormData): Promise<FormState> {
  const { t, restaurantId, supabase } = await ctx(fd);
  const name = i18nFromForm(fd, "name");
  if (!Object.keys(name).length) return { error: t.menu.nameRequired };
  const price = toMinor(s(fd, "price"), await currencyOf(supabase, restaurantId));
  if (price === null) return { error: t.menu.priceInvalid };
  const categoryId = s(fd, "category_id");
  const { data: last } = await supabase.from("menu_items").select("sort").eq("category_id", categoryId)
    .order("sort", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase.from("menu_items").insert({
    restaurant_id: restaurantId, category_id: categoryId, name, description: i18nFromForm(fd, "description"),
    price_minor: price, sort: (last?.sort ?? 0) + 10,
  }).select("id").single();
  if (error) return dbError(error, t.security.reauthPrompt);
  refreshRestaurant(restaurantId);
  redirect(`/r/${restaurantId}/menu/items/${data.id}`);
}

export async function saveItem(_: FormState, fd: FormData): Promise<FormState> {
  const { t, restaurantId, supabase } = await ctx(fd);
  const name = i18nFromForm(fd, "name");
  const description = i18nFromForm(fd, "description");
  if (!Object.keys(name).length) return { error: t.menu.nameRequired };
  const price = toMinor(s(fd, "price"), await currencyOf(supabase, restaurantId));
  if (price === null) return { error: t.menu.priceInvalid };
  const calories = s(fd, "calories") ? Number(s(fd, "calories")) : null;
  if (calories !== null && !(Number.isInteger(calories) && calories >= 0)) return { error: t.menu.caloriesInvalid };
  const { data: row } = await supabase.from("menu_items").select("name, description, i18n_meta").eq("id", s(fd, "id")).single();
  let meta = markEdited(row?.i18n_meta, row?.name, name);
  meta = markEdited(meta, row?.description, description);
  return update(fd, "menu_items", {
    name, description, price_minor: price, calories, category_id: s(fd, "category_id"),
    allergens: fd.getAll("allergens").map(String) as Allergen[],
    dietary_tags: fd.getAll("dietary").map(String) as DietaryTag[],
    spice_level: Number(s(fd, "spice_level")) || 0,
    is_available: fd.get("is_available") === "on",
    is_active: fd.get("is_active") === "on",
    i18n_meta: meta,
  });
}

/** One-tap sold out / back in stock from the menu list. */
export async function toggleAvailable(_: FormState, fd: FormData): Promise<FormState> {
  return update(fd, "menu_items", { is_available: s(fd, "available") === "true" });
}

// --- Variants, option groups, options --------------------------------------------------------

export async function addVariant(_: FormState, fd: FormData): Promise<FormState> {
  const { t, restaurantId, supabase } = await ctx(fd);
  const name = i18nFromForm(fd, "name");
  if (!Object.keys(name).length) return { error: t.menu.nameRequired };
  const price = toMinor(s(fd, "price"), await currencyOf(supabase, restaurantId));
  if (price === null) return { error: t.menu.priceInvalid };
  const { error } = await supabase.from("menu_item_variants").insert({
    restaurant_id: restaurantId, item_id: s(fd, "item_id"), name, price_minor: price, sort: Date.now() % 1_000_000,
  });
  if (error) return dbError(error, t.security.reauthPrompt);
  return done(restaurantId, t.common.saved);
}

export async function saveVariant(_: FormState, fd: FormData): Promise<FormState> {
  const { t, restaurantId, supabase } = await ctx(fd);
  const name = i18nFromForm(fd, "name");
  if (!Object.keys(name).length) return { error: t.menu.nameRequired };
  const price = toMinor(s(fd, "price"), await currencyOf(supabase, restaurantId));
  if (price === null) return { error: t.menu.priceInvalid };
  const { data: row } = await supabase.from("menu_item_variants").select("name, i18n_meta").eq("id", s(fd, "id")).single();
  return update(fd, "menu_item_variants", { name, price_minor: price, i18n_meta: markEdited(row?.i18n_meta, row?.name, name) });
}

function selectBounds(fd: FormData) {
  const min = Number(s(fd, "min_select")) || 0;
  const max = s(fd, "max_select") ? Number(s(fd, "max_select")) : null;
  return { min, max, invalid: min < 0 || (max !== null && max < Math.max(min, 1)) };
}

export async function addGroup(_: FormState, fd: FormData): Promise<FormState> {
  const { t, restaurantId, supabase } = await ctx(fd);
  const name = i18nFromForm(fd, "name");
  if (!Object.keys(name).length) return { error: t.menu.nameRequired };
  const { min, max, invalid } = selectBounds(fd);
  if (invalid) return { error: t.menu.selectInvalid };
  const { error } = await supabase.from("menu_option_groups").insert({
    restaurant_id: restaurantId, item_id: s(fd, "item_id"), name, min_select: min, max_select: max, sort: Date.now() % 1_000_000,
  });
  if (error) return dbError(error, t.security.reauthPrompt);
  return done(restaurantId, t.common.saved);
}

export async function saveGroup(_: FormState, fd: FormData): Promise<FormState> {
  const { t, supabase } = await ctx(fd);
  const name = i18nFromForm(fd, "name");
  if (!Object.keys(name).length) return { error: t.menu.nameRequired };
  const { min, max, invalid } = selectBounds(fd);
  if (invalid) return { error: t.menu.selectInvalid };
  const { data: row } = await supabase.from("menu_option_groups").select("name, i18n_meta").eq("id", s(fd, "id")).single();
  return update(fd, "menu_option_groups", { name, min_select: min, max_select: max, i18n_meta: markEdited(row?.i18n_meta, row?.name, name) });
}

export async function addOption(_: FormState, fd: FormData): Promise<FormState> {
  const { t, restaurantId, supabase } = await ctx(fd);
  const name = i18nFromForm(fd, "name");
  if (!Object.keys(name).length) return { error: t.menu.nameRequired };
  const delta = s(fd, "price") ? toMinor(s(fd, "price"), await currencyOf(supabase, restaurantId)) : 0;
  if (delta === null) return { error: t.menu.priceInvalid };
  const { error } = await supabase.from("menu_options").insert({
    restaurant_id: restaurantId, group_id: s(fd, "group_id"), name, price_delta_minor: delta, sort: Date.now() % 1_000_000,
  });
  if (error) return dbError(error, t.security.reauthPrompt);
  return done(restaurantId, t.common.saved);
}

// --- Branch availability ---------------------------------------------------------------------

/** state: "default" removes the override; "hidden" / "unavailable" set it for that branch. */
export async function setBranchOverride(_: FormState, fd: FormData): Promise<FormState> {
  const { t, restaurantId, supabase } = await ctx(fd);
  const itemId = s(fd, "item_id");
  const branchId = s(fd, "branch_id");
  const state = s(fd, "state");
  const { error: delError } = await supabase.from("branch_menu_overrides").delete().eq("item_id", itemId).eq("branch_id", branchId);
  if (delError) return dbError(delError, t.security.reauthPrompt);
  if (state === "hidden" || state === "unavailable") {
    const { error } = await supabase.from("branch_menu_overrides").insert({
      restaurant_id: restaurantId, branch_id: branchId, item_id: itemId,
      is_hidden: state === "hidden", is_available: state !== "unavailable",
    });
    if (error) return dbError(error, t.security.reauthPrompt);
  }
  return done(restaurantId, t.common.saved);
}

// --- Media -----------------------------------------------------------------------------------

/** Called by the upload component after the file is in storage under {restaurant}/menu/. */
export async function addItemMedia(restaurantId: string, itemId: string, m: UploadedMedia): Promise<FormState> {
  const { t } = await getDictionary();
  const supabase = await createClient();
  const { count } = await supabase.from("menu_item_media").select("id", { count: "exact", head: true })
    .eq("item_id", itemId).eq("is_cover", true);
  const { error } = await supabase.from("menu_item_media").insert({
    restaurant_id: restaurantId, item_id: itemId, kind: m.kind, storage_path: m.path,
    poster_path: m.posterPath, width: m.width, height: m.height, bytes: m.bytes,
    is_cover: m.kind === "image" && !count, sort: Date.now() % 1_000_000,
  });
  if (error) {
    // The row was refused (plan limit, permissions): remove the orphaned upload.
    await supabase.storage.from("restaurant-public").remove([m.path, ...(m.posterPath ? [m.posterPath] : [])]);
    return dbError(error, t.security.reauthPrompt);
  }
  refreshRestaurant(restaurantId);
  return undefined;
}

export async function setCover(_: FormState, fd: FormData): Promise<FormState> {
  const { t, restaurantId, supabase } = await ctx(fd);
  const { error: e1 } = await supabase.from("menu_item_media").update({ is_cover: false }).eq("item_id", s(fd, "item_id")).eq("is_cover", true);
  if (e1) return dbError(e1, t.security.reauthPrompt);
  const { error } = await supabase.from("menu_item_media").update({ is_cover: true }).eq("id", s(fd, "id"));
  if (error) return dbError(error, t.security.reauthPrompt);
  return done(restaurantId, "ok");
}

export async function removeMedia(_: FormState, fd: FormData): Promise<FormState> {
  const { t, restaurantId, supabase } = await ctx(fd);
  const { data, error } = await supabase.from("menu_item_media").delete().eq("id", s(fd, "id")).select("storage_path, poster_path");
  if (error) return dbError(error, t.security.reauthPrompt);
  const paths = (data ?? []).flatMap((m) => [m.storage_path, m.poster_path].filter(Boolean) as string[]);
  if (paths.length) await supabase.storage.from("restaurant-public").remove(paths);
  return done(restaurantId, "ok");
}

// --- Translations ----------------------------------------------------------------------------

export async function markReviewed(_: FormState, fd: FormData): Promise<FormState> {
  const { t, restaurantId, supabase } = await ctx(fd);
  const { error } = await supabase.rpc("mark_translation_reviewed", {
    p_entity: s(fd, "entity"), p_id: s(fd, "id"), p_locale: s(fd, "locale"),
  });
  if (error) return dbError(error, t.security.reauthPrompt);
  return done(restaurantId, "ok");
}
