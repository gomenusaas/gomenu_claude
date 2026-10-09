import { NextResponse, type NextRequest } from "next/server";
import { adapterFor } from "@/lib/payments";
import type { ConnectionSecret } from "@/lib/payments/types";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Payment gateway webhooks (spec §11). The ONLY way an online payment or refund succeeds:
 * the signature is checked with the connection's secret, then apply_payment_event records the
 * event once (replays are no-ops) and checks amount and currency against what GoMenu asked for.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ gateway: string }> }) {
  const { gateway } = await params;
  const raw = await request.text();
  if (raw.length > 64_000) return NextResponse.json({ error: "too large" }, { status: 413 });
  let paymentId: unknown;
  try {
    paymentId = (JSON.parse(raw) as { payment_id?: unknown }).payment_id;
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (typeof paymentId !== "string" || !UUID.test(paymentId)) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const admin = createAdminClient();
  const { data } = await admin.rpc("payment_connection_secret", { p_payment_id: paymentId });
  const conn = data as unknown as ConnectionSecret | null;
  if (!conn || conn.gateway !== gateway) return NextResponse.json({ error: "unknown payment" }, { status: 404 });
  const adapter = adapterFor(conn.provider);
  const event = adapter?.verifyWebhook(raw, request.headers, conn);
  if (!event || event.payment_id !== paymentId || typeof event.id !== "string") {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const { data: result, error } = await admin.rpc("apply_payment_event", { p_gateway_key: gateway, p_event: event as never });
  if (error) return NextResponse.json({ error: "could not apply" }, { status: 500 });  // the provider retries
  return NextResponse.json({ result });
}
