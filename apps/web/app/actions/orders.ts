"use server";

import { revalidatePath } from "next/cache";
import { dbError, type FormState } from "@/components/form-state";
import { seal } from "@/lib/crypto";
import { getDictionary } from "@/lib/i18n";
import { adapterFor } from "@/lib/payments";
import type { ConnectionSecret } from "@/lib/payments/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type DbError = { message: string; code?: string; hint?: string | null };
type Enums = Database["public"]["Enums"];

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Run an order RPC; map the database's hint to a message; refresh the order screens. */
async function run(fd: FormData, fn: (sb: Supabase) => PromiseLike<{ error: DbError | null }>): Promise<FormState> {
  const { t } = await getDictionary();
  const { error } = await fn(await createClient());
  const rid = s(fd, "restaurant_id");
  revalidatePath(`/r/${rid}/orders`, "layout");
  revalidatePath(`/r/${rid}/kitchen`);
  if (error) {
    const known = error.hint ? t.orders.errors[error.hint] : undefined;
    return known ? { error: known } : dbError(error, t.security.reauthPrompt);
  }
  return undefined;
}

export async function setShift(_: FormState, fd: FormData) {
  return run(fd, (sb) => sb.rpc("set_shift", { p_branch_id: s(fd, "branch_id"), p_on: s(fd, "on") === "true" }));
}
export async function acceptOrder(_: FormState, fd: FormData) {
  return run(fd, (sb) => sb.rpc("accept_order", { p_order_id: s(fd, "id") }));
}
export async function confirmOrder(_: FormState, fd: FormData) {
  return run(fd, (sb) => sb.rpc("confirm_order", { p_order_id: s(fd, "id") }));
}
export async function rejectOrder(_: FormState, fd: FormData) {
  return run(fd, (sb) => sb.rpc("reject_order", {
    p_order_id: s(fd, "id"), p_reason: (s(fd, "reason") || "other") as Enums["reject_reason"], p_note: s(fd, "note") || undefined,
  }));
}
export async function assignOrder(_: FormState, fd: FormData) {
  return run(fd, (sb) => sb.rpc("assign_order", { p_order_id: s(fd, "id"), p_waiter_id: (s(fd, "waiter_id") || null) as string }));
}
export async function markServed(_: FormState, fd: FormData) {
  return run(fd, (sb) => sb.rpc("mark_served", { p_order_id: s(fd, "id") }));
}
export async function completeOrder(_: FormState, fd: FormData) {
  return run(fd, (sb) => sb.rpc("complete_order", { p_order_id: s(fd, "id") }));
}
export async function recordPayment(_: FormState, fd: FormData) {
  return run(fd, (sb) => sb.rpc("record_offline_payment", {
    p_order_id: s(fd, "id"), p_method: s(fd, "method") as Enums["order_payment_method"], p_reference: s(fd, "reference") || undefined,
  }));
}
export async function cancelOrder(_: FormState, fd: FormData) {
  return run(fd, (sb) => sb.rpc("cancel_order", { p_order_id: s(fd, "id"), p_note: s(fd, "note") }));
}
export async function markTestOrder(_: FormState, fd: FormData) {
  return run(fd, (sb) => sb.rpc("mark_test_order", { p_order_id: s(fd, "id"), p_is_test: s(fd, "value") === "true" }));
}
export async function kitchenUpdate(_: FormState, fd: FormData) {
  return run(fd, (sb) => sb.rpc("kitchen_update", { p_order_id: s(fd, "id"), p_status: s(fd, "status") as Enums["order_status"] }));
}
export async function acknowledgeKitchenAlert(_: FormState, fd: FormData) {
  return run(fd, (sb) => sb.rpc("acknowledge_kitchen_alert", { p_order_id: s(fd, "id") }));
}

export type ComposerLine = { item_id: string; variant_id: string | null; option_ids: string[]; quantity: number; notes: string | null };

/** Waiter orders and edits from the composer. Returns a hint code the composer can show. */
export async function createWaiterOrder(input: {
  restaurantId: string; branchId: string; serviceType: "table" | "car"; tableId?: string; carPlate?: string;
  carDescription?: string; customerName?: string; notes?: string; items: ComposerLine[];
}): Promise<{ ok: true; orderId: string } | { ok: false; code: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_waiter_order", {
    p_branch_id: input.branchId,
    p_payload: {
      service_type: input.serviceType, table_id: input.tableId || null, car_plate: input.carPlate || null,
      car_description: input.carDescription || null, customer_name: input.customerName || null, notes: input.notes || null,
      items: input.items.slice(0, 100),
    },
  });
  if (error) return { ok: false, code: error.hint ?? (error.code === "42501" ? "forbidden" : "generic") };
  revalidatePath(`/r/${input.restaurantId}/orders`, "layout");
  return { ok: true, orderId: (data as { order_id: string }).order_id };
}

export async function editOrderItems(input: { restaurantId: string; orderId: string; items: ComposerLine[] }) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("edit_order_items", { p_order_id: input.orderId, p_items: input.items.slice(0, 100) as never });
  if (error) return { ok: false as const, code: error.hint ?? "generic" };
  revalidatePath(`/r/${input.restaurantId}/orders`, "layout");
  revalidatePath(`/r/${input.restaurantId}/kitchen`);
  return { ok: true as const };
}

/** Refund (owners, fresh OTP). Online refunds are sent to the gateway, which confirms by webhook. */
export async function refundPayment(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const supabase = await createClient();
  const amount = Math.round(Number(s(fd, "amount")) * 10 ** Number(s(fd, "exp") || 3));
  if (!Number.isFinite(amount) || amount <= 0) return { error: t.orders.errors.BAD_AMOUNT };
  const { data, error } = await supabase.rpc("request_refund", { p_payment_id: s(fd, "payment_id"), p_amount_minor: amount, p_reason: s(fd, "reason") });
  if (error) {
    const known = error.hint ? t.orders.errors[error.hint] : undefined;
    return known ? { error: known } : dbError(error, t.security.reauthPrompt);
  }
  const refund = data as { refund_id: string; status: string; payment_id?: string; provider?: string };
  if (refund.status === "pending" && refund.provider) {
    const { data: secret } = await createAdminClient().rpc("payment_connection_secret", { p_payment_id: s(fd, "payment_id") });
    const adapter = adapterFor(refund.provider);
    if (adapter && secret) {
      await adapter.refund({ payment_id: s(fd, "payment_id"), refund_id: refund.refund_id, amount_minor: amount }, secret as unknown as ConnectionSecret);
    }
  }
  revalidatePath(`/r/${s(fd, "restaurant_id")}/orders`, "layout");
  return { ok: t.ordering.saved };
}

// --- Settings -------------------------------------------------------------------------------------

export async function saveOrderingSettings(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const supabase = await createClient();
  const on = (k: string) => fd.get(k) === "on";
  const timing = (k: string) => (s(fd, k) === "before" ? "before" : "after") as Enums["payment_timing"];
  const vat = Math.round(Number(s(fd, "vat_rate")) * 100);
  const delay = Math.round(Number(s(fd, "kitchen_delay_minutes")));
  const { error } = await supabase.from("ordering_settings").update({
    waiter_confirmation: on("waiter_confirmation"),
    assignment_mode: s(fd, "assignment_mode") as Enums["assignment_mode"],
    auto_accept_online: on("auto_accept_online"),
    service_table: on("service_table"), service_car: on("service_car"), service_pickup: on("service_pickup"),
    timing_table: timing("timing_table"), timing_car: timing("timing_car"), timing_pickup: timing("timing_pickup"),
    vat_rate_bp: Number.isFinite(vat) ? vat : 0, prices_include_vat: on("prices_include_vat"),
    kitchen_delay_minutes: Number.isFinite(delay) ? delay : 15,
  }).eq("restaurant_id", s(fd, "restaurant_id"));
  if (error) return dbError(error, t.security.reauthPrompt);
  revalidatePath(`/r/${s(fd, "restaurant_id")}/ordering`);
  return { ok: t.ordering.saved };
}

export async function setTableWaiter(_: FormState, fd: FormData) {
  return run(fd, (sb) => sb.rpc("set_table_waiter", { p_table_id: s(fd, "table_id"), p_waiter_id: (s(fd, "waiter_id") || null) as string }));
}

export async function connectGateway(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const supabase = await createClient();
  const rid = s(fd, "restaurant_id");
  const adapter = adapterFor(s(fd, "provider"));
  if (!adapter) return { error: t.orders.errors.WRONG_STATUS };
  const credentials = Object.fromEntries([...fd.entries()].filter(([k]) => k.startsWith("cred_")).map(([k, v]) => [k.slice(5), String(v)]));
  const { publicConfig, secret } = await adapter.connect(credentials);
  const { error } = await supabase.rpc("connect_gateway", {
    p_restaurant_id: rid, p_gateway_key: s(fd, "gateway"), p_public_config: publicConfig, p_secret_ciphertext: seal(secret, "payments"),
  });
  if (error) return dbError(error, t.security.reauthPrompt);
  revalidatePath(`/r/${rid}/payments`);
  return undefined;
}

export async function disconnectGateway(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const supabase = await createClient();
  const { error } = await supabase.rpc("disconnect_gateway", { p_restaurant_id: s(fd, "restaurant_id"), p_gateway_key: s(fd, "gateway") });
  if (error) return dbError(error, t.security.reauthPrompt);
  revalidatePath(`/r/${s(fd, "restaurant_id")}/payments`);
  return undefined;
}
