"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adapterFor, requestOrigin } from "@/lib/payments";
import { sendTestWebhook } from "@/lib/payments/test-gateway";
import type { ConnectionSecret } from "@/lib/payments/types";
import { toE164 } from "@/lib/phone";
import { TABLE_COOKIE, type TableContext } from "@/lib/site/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface CartLineInput {
  item_id: string;
  variant_id?: string | null;
  option_ids?: string[];
  quantity: number;
  notes?: string | null;
}

export type OrderResult = { ok: true; publicKey: string; number: number } | { ok: false; code: string };

const UUID = /^[0-9a-f-]{36}$/;
const KEY = /^[A-Za-z0-9_-]{22,64}$/;

async function tableToken(restaurantId: string): Promise<string | null> {
  try {
    const raw = (await cookies()).get(TABLE_COOKIE)?.value;
    const ctx = raw ? (JSON.parse(raw) as TableContext) : null;
    return ctx?.restaurant_id === restaurantId && ctx.token && KEY.test(ctx.token) ? ctx.token : null;
  } catch {
    return null;
  }
}

/**
 * Place an order from the website or a QR code. The browser sends only what was chosen; the
 * database prices it from the current menu and resolves the table from the QR token in the
 * visitor's cookie. Signed-in diners get the order in their account.
 */
export async function placeOrder(input: {
  restaurantId: string; serviceType: "table" | "car" | "pickup"; branchId?: string | null; carPlate?: string;
  carDescription?: string; name?: string; phone?: string; notes?: string; items: CartLineInput[];
}): Promise<OrderResult> {
  if (!UUID.test(input.restaurantId) || !Array.isArray(input.items)) return { ok: false, code: "generic" };
  const phone = input.phone?.trim() ? toE164(input.phone) : null;
  if (input.phone?.trim() && !phone) return { ok: false, code: "PHONE_INVALID" };
  const items = input.items.slice(0, 100).map((l) => ({
    item_id: l.item_id, variant_id: l.variant_id ?? null, option_ids: (l.option_ids ?? []).slice(0, 30),
    quantity: Math.max(1, Math.min(50, Math.trunc(Number(l.quantity) || 1))), notes: l.notes?.slice(0, 200) ?? null,
  }));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("place_order", {
    p_restaurant_id: input.restaurantId,
    p_payload: {
      branch_id: input.branchId ?? null, service_type: input.serviceType, qr_token: await tableToken(input.restaurantId),
      car_plate: input.carPlate ?? null, car_description: input.carDescription ?? null, customer_name: input.name ?? null,
      customer_phone: phone, notes: input.notes ?? null, items,
    },
  });
  if (error) return { ok: false, code: error.hint && /^[A-Z_]+$/.test(error.hint) ? error.hint : "generic" };
  const placed = data as { public_key: string; number: number };
  return { ok: true, publicKey: placed.public_key, number: placed.number };
}

/** Start an online payment for an order the diner holds the link to; returns where to pay. */
export async function startPayment(publicKey: string): Promise<{ url: string } | { code: string }> {
  if (!KEY.test(publicKey)) return { code: "NOT_PAYABLE" };
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("start_online_payment", { p_public_key: publicKey });
  if (error) return { code: error.hint === "NOT_PAYABLE" ? "NOT_PAYABLE" : "generic" };
  const payment = data as { payment_id: string; amount_minor: number; currency: string; provider: string };
  const adapter = adapterFor(payment.provider);
  if (!adapter) return { code: "NOT_PAYABLE" };
  return { url: await adapter.checkoutUrl(payment, await requestOrigin()) };
}

export async function cancelMyOrder(publicKey: string): Promise<{ ok: boolean; code?: string }> {
  if (!KEY.test(publicKey)) return { ok: false, code: "generic" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_my_order", { p_public_key: publicKey });
  return error ? { ok: false, code: error.hint ?? "generic" } : { ok: true };
}

/**
 * The built-in test gateway's "bank": approve or decline the payment, then deliver the result
 * the way a real provider does — as a signed webhook. The redirect back carries no payment
 * information; the tracking page shows what the webhook recorded.
 */
export async function completeTestPayment(formData: FormData): Promise<void> {
  const paymentId = String(formData.get("payment_id") ?? "");
  const outcome = formData.get("outcome") === "decline" ? "decline" : "approve";
  if (!UUID.test(paymentId)) redirect("/");
  const admin = createAdminClient();
  const [{ data: checkout }, { data: secret }] = await Promise.all([
    admin.rpc("payment_checkout", { p_payment_id: paymentId }),
    admin.rpc("payment_connection_secret", { p_payment_id: paymentId }),
  ]);
  const pay = checkout as { status: string; amount_minor: number; currency: string; slug: string; public_key: string; provider: string } | null;
  const conn = secret as unknown as ConnectionSecret | null;
  if (!pay || !conn || pay.provider !== "test") redirect("/");
  if (pay.status === "pending") {
    await sendTestWebhook(conn.gateway, conn.connection_id, outcome === "approve"
      ? { id: `evt_${randomUUID()}`, type: "payment.succeeded", payment_id: paymentId, amount_minor: pay.amount_minor,
          currency: pay.currency, provider_reference: `tx_${randomUUID().slice(0, 12)}` }
      : { id: `evt_${randomUUID()}`, type: "payment.failed", payment_id: paymentId, amount_minor: pay.amount_minor,
          currency: pay.currency, reason: "Declined by the test card" });
  }
  redirect(`/${pay.slug}/order/${pay.public_key}`);
}
