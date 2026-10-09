import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ComposerItem = {
  id: string; category_id: string; name: Record<string, string>; price_minor: number; is_available: boolean;
  variants: { id: string; name: Record<string, string>; price_minor: number; is_default: boolean }[];
  groups: { id: string; name: Record<string, string>; min_select: number; max_select: number | null;
            options: { id: string; name: Record<string, string>; price_delta_minor: number; is_available: boolean }[] }[];
};
export type ComposerMenu = {
  categories: { id: string; name: Record<string, string> }[];
  items: ComposerItem[];
  unavailable: { branch_id: string; item_id: string | null; category_id: string | null }[];
};

/** The current menu for staff composing orders (RLS: menu.view). Prices are re-checked on save. */
export async function loadComposerMenu(restaurantId: string): Promise<ComposerMenu> {
  const supabase = await createClient();
  const [{ data: cats }, { data: items }, { data: variants }, { data: groups }, { data: options }, { data: overrides }] = await Promise.all([
    supabase.from("menu_categories").select("id, name").eq("restaurant_id", restaurantId).eq("is_active", true).is("archived_at", null).order("sort"),
    supabase.from("menu_items").select("id, category_id, name, price_minor, is_available").eq("restaurant_id", restaurantId)
      .eq("is_active", true).is("archived_at", null).order("sort"),
    supabase.from("menu_item_variants").select("id, item_id, name, price_minor, is_default").eq("restaurant_id", restaurantId).is("archived_at", null).order("sort"),
    supabase.from("menu_option_groups").select("id, item_id, name, min_select, max_select").eq("restaurant_id", restaurantId).is("archived_at", null).order("sort"),
    supabase.from("menu_options").select("id, group_id, name, price_delta_minor, is_available").eq("restaurant_id", restaurantId).is("archived_at", null).order("sort"),
    supabase.from("branch_menu_overrides").select("branch_id, item_id, category_id, is_hidden, is_available").eq("restaurant_id", restaurantId),
  ]);
  type I18n = Record<string, string>;
  return {
    categories: (cats ?? []).map((c) => ({ id: c.id, name: c.name as I18n })),
    items: (items ?? []).map((i) => ({
      id: i.id, category_id: i.category_id, name: i.name as I18n, price_minor: Number(i.price_minor), is_available: i.is_available,
      variants: (variants ?? []).filter((v) => v.item_id === i.id)
        .map((v) => ({ id: v.id, name: v.name as I18n, price_minor: Number(v.price_minor), is_default: v.is_default })),
      groups: (groups ?? []).filter((g) => g.item_id === i.id).map((g) => ({
        id: g.id, name: g.name as I18n, min_select: g.min_select, max_select: g.max_select,
        options: (options ?? []).filter((o) => o.group_id === g.id)
          .map((o) => ({ id: o.id, name: o.name as I18n, price_delta_minor: Number(o.price_delta_minor), is_available: o.is_available })),
      })),
    })),
    unavailable: (overrides ?? []).filter((o) => o.is_hidden || !o.is_available)
      .map((o) => ({ branch_id: o.branch_id, item_id: o.item_id, category_id: o.category_id })),
  };
}
