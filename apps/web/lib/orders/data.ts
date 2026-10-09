import "server-only";
import type { Dictionary } from "@/lib/i18n/en";
import { createClient } from "@/lib/supabase/server";

export const ORDER_COLUMNS =
  "id, number, branch_id, source, service_type, status, payment_status, payment_timing, needs_confirmation, table_id, " +
  "car_plate, car_description, customer_name, customer_phone, notes, currency, subtotal_minor, vat_minor, vat_rate_bp, " +
  "prices_include_vat, total_minor, refunded_minor, created_by, assigned_waiter_id, confirmed_at, kitchen_released_at, " +
  "kitchen_alert, preparing_at, ready_at, served_at, completed_at, closed_note, rejected_reason, is_test, created_at";

export interface OrderRow {
  id: string; number: number; branch_id: string; source: string; service_type: "table" | "car" | "pickup";
  status: string; payment_status: string; payment_timing: "before" | "after"; needs_confirmation: boolean;
  table_id: string | null; car_plate: string | null; car_description: string | null; customer_name: string | null;
  customer_phone: string | null; notes: string | null; currency: string; subtotal_minor: number; vat_minor: number;
  vat_rate_bp: number; prices_include_vat: boolean; total_minor: number; refunded_minor: number; created_by: string | null;
  assigned_waiter_id: string | null; confirmed_at: string | null; kitchen_released_at: string | null; kitchen_alert: boolean;
  preparing_at: string | null; ready_at: string | null; served_at: string | null; completed_at: string | null;
  closed_note: string | null; rejected_reason: string | null; is_test: boolean; created_at: string;
}

export type StaffMember = { user_id: string; name: string; role: string; on_shift: boolean };

/** Everything the order screens share: permissions, branches in scope, staff, tables, settings. */
export async function orderContext(restaurantId: string, userId: string) {
  const supabase = await createClient();
  const [{ data: perms }, { data: branches }, { data: settings }, { data: tables }, { data: shifts }] = await Promise.all([
    supabase.rpc("my_permissions", { p_restaurant_id: restaurantId }),
    supabase.from("branches").select("id, name").eq("restaurant_id", restaurantId).is("archived_at", null).order("sort"),
    supabase.from("ordering_settings").select("*").eq("restaurant_id", restaurantId).single(),
    supabase.from("restaurant_tables").select("id, branch_id, label, section, assigned_waiter_id, is_active")
      .eq("restaurant_id", restaurantId).is("archived_at", null).order("label"),
    supabase.from("waiter_shifts").select("branch_id").eq("user_id", userId).is("ended_at", null),
  ]);
  const can = (p: string) => (perms ?? []).includes(p);
  // Branches this person works in: the staff list RPC answers only for those.
  const staffByBranch = new Map<string, StaffMember[]>();
  await Promise.all((branches ?? []).map(async (b) => {
    const { data, error } = await supabase.rpc("branch_order_staff", { p_branch_id: b.id });
    if (!error) staffByBranch.set(b.id, (data ?? []) as unknown as StaffMember[]);
  }));
  const myBranches = (branches ?? []).filter((b) => staffByBranch.has(b.id));
  const names = new Map<string, string>();
  for (const list of staffByBranch.values()) for (const m of list) names.set(m.user_id, m.name);
  return {
    supabase, can, settings, myBranches, staffByBranch, names,
    tables: tables ?? [],
    onShift: new Set((shifts ?? []).map((s) => s.branch_id)),
  };
}

export function serviceLabel(t: Dictionary, o: Pick<OrderRow, "service_type" | "table_id" | "car_plate">, tables: { id: string; label: string }[]) {
  if (o.service_type === "table") return t.orders.service.table.replace("{label}", tables.find((x) => x.id === o.table_id)?.label ?? "?");
  if (o.service_type === "car") return t.orders.service.car.replace("{plate}", o.car_plate ?? "");
  return t.orders.service.pickup;
}

type Status = import("@/lib/database.types").Database["public"]["Enums"]["order_status"];
export const OPEN_STATUSES: Status[] = ["new", "confirmed", "preparing", "ready", "served"];
export const CLOSED_STATUSES: Status[] = ["completed", "rejected", "cancelled", "refunded"];
