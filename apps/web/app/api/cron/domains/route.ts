import { NextResponse } from "next/server";
import { syncDomain } from "@/lib/domains/sync";
import { serverEnv } from "@/lib/server-env";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PENDING = ["not_connected", "dns_required", "verifying", "connected", "ssl_pending", "error"] as const;

/**
 * Vercel Cron (vercel.json) re-checks custom domains: pending ones until they are active, and
 * active ones once a day so a removed DNS record shows up as a problem. Vercel sends
 * `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: Request) {
  if (!serverEnv.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${serverEnv.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const { data: domains, error } = await admin.from("restaurant_domains").select("id, hostname, status, last_checked_at")
    .or(`status.in.(${PENDING.join(",")}),last_checked_at.lt.${dayAgo},last_checked_at.is.null`)
    .order("last_checked_at", { ascending: true, nullsFirst: true }).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const results = [];
  for (const d of domains ?? []) {
    const r = await syncDomain(d);
    results.push({ hostname: d.hostname, status: r.status });
  }
  return NextResponse.json({ checked: results.length, results });
}
