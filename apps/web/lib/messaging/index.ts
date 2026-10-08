import "server-only";
import { publicEnv } from "@/lib/env";

/**
 * Outbound WhatsApp/SMS is queued in the database (private.message_outbox) by the RPCs that
 * need it (staff invitations, Supabase Auth OTPs via the Send SMS hook). A provider-specific
 * sender drains that queue in staging/production; the provider is an open decision (§17).
 *
 * Locally, the queue is the delivery channel: /dev/outbox renders the messages.
 */
export interface OutboxMessage {
  id: string;
  channel: "whatsapp" | "sms";
  to: string;
  template: "staff_invitation" | "auth_otp" | string;
  payload: Record<string, unknown>;
  created_at: string;
}

export function invitationUrl(token: string): string {
  return `${publicEnv.NEXT_PUBLIC_APP_URL}/invite/${encodeURIComponent(token)}`;
}

/** Human-readable body for a queued message (what the recipient would receive). */
export function renderMessage(m: OutboxMessage): string {
  if (m.template === "staff_invitation") {
    const p = m.payload as { staff_name?: string; restaurant_name?: string; token?: string };
    return `Hi ${p.staff_name}, ${p.restaurant_name} invited you to GoMenu: ${invitationUrl(String(p.token))}`;
  }
  if (m.template === "auth_otp") {
    return `Your GoMenu code is ${(m.payload as { otp?: string }).otp}`;
  }
  return JSON.stringify(m.payload);
}
