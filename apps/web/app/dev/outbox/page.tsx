import { notFound } from "next/navigation";
import { renderMessage, type OutboxMessage } from "@/lib/messaging";
import { serverEnv } from "@/lib/server-env";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dev outbox", robots: { index: false } };

// Local/dev only: what WhatsApp/SMS would have delivered (OTP codes, invitation links).
// Double-gated: GOMENU_DEV_OUTBOX=true here AND private.app_settings.dev_outbox_enabled in
// the database (set only by the dev seed).
export default async function DevOutbox() {
  if (serverEnv.GOMENU_DEV_OUTBOX !== "true") notFound();
  const { data, error } = await createAdminClient().rpc("dev_list_outbox", { p_limit: 50 });
  if (error) notFound();
  const messages = (data ?? []) as unknown as OutboxMessage[];
  return (
    <main className="mx-auto grid max-w-3xl gap-3 p-4" dir="ltr">
      <h1 className="text-xl font-semibold">Dev outbox</h1>
      {messages.map((m) => (
        <article key={m.id} className="rounded-md border p-3 text-sm" data-testid="outbox-message">
          <div className="text-muted-foreground">
            {m.channel} → {m.to} · {m.template} · {new Date(m.created_at).toLocaleString()}
          </div>
          <p className="break-all">{renderMessage(m)}</p>
        </article>
      ))}
    </main>
  );
}
