import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/server-env";
import type { ConnectionSecret, GatewayAdapter, GatewayEvent } from "./types";

/**
 * GoMenu's built-in test gateway: no real money. The diner "pays" on /pay/test/{id}; the
 * simulator then sends a signed webhook exactly like a real provider would, and only that
 * webhook marks the order paid. The signing secret is derived per connection from the server's
 * payments key, so nothing secret is stored for it.
 */
export const SIGNATURE_HEADER = "x-gomenu-test-signature";
const TOLERANCE_SECONDS = 300;

function secretFor(connectionId: string): Buffer {
  return createHmac("sha256", Buffer.from(serverEnv.GOMENU_PAYMENTS_KEY, "base64")).update(`test-gateway:${connectionId}`).digest();
}

export function signTestWebhook(body: string, connectionId: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const mac = createHmac("sha256", secretFor(connectionId)).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

function verify(body: string, header: string | null, connectionId: string): boolean {
  const parts = Object.fromEntries((header ?? "").split(",").map((p) => p.split("=", 2) as [string, string]));
  const ts = Number(parts.t);
  if (!Number.isInteger(ts) || !parts.v1 || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(signTestWebhook(body, connectionId, ts).split("v1=")[1], "hex");
  const given = Buffer.from(parts.v1, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Send a signed event to our own webhook endpoint, as the provider would. Always to the app's
 * configured address, never to a host taken from the request.
 */
export async function sendTestWebhook(gateway: string, connectionId: string, event: GatewayEvent): Promise<Response> {
  const body = JSON.stringify(event);
  return fetch(`${publicEnv.NEXT_PUBLIC_APP_URL}/api/payments/webhook/${gateway}`, {
    method: "POST",
    headers: { "content-type": "application/json", [SIGNATURE_HEADER]: signTestWebhook(body, connectionId) },
    body,
    cache: "no-store",
  });
}

export const testGateway: GatewayAdapter = {
  provider: "test",
  async connect() {
    return { publicConfig: { mode: "test" }, secret: JSON.stringify({ mode: "test" }) };
  },
  async checkoutUrl(payment, origin) {
    return `${origin}/pay/test/${payment.payment_id}`;
  },
  verifyWebhook(rawBody, headers, conn: ConnectionSecret) {
    if (!verify(rawBody, headers.get(SIGNATURE_HEADER), conn.connection_id)) return null;
    try {
      return JSON.parse(rawBody) as GatewayEvent;
    } catch {
      return null;
    }
  },
  async refund(input, conn) {
    // The simulator approves every refund at once.
    await sendTestWebhook(conn.gateway, conn.connection_id, {
      id: `evt_${randomUUID()}`, type: "refund.succeeded", payment_id: input.payment_id, refund_id: input.refund_id,
      amount_minor: input.amount_minor, provider_reference: `re_${randomUUID().slice(0, 12)}`,
    });
  },
};
