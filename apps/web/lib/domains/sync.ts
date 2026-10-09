import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { type DomainCheck, getDomainProvider } from "./provider";

/** Ask the provider for a domain's state and record it (service role: set_domain_status). */
export async function syncDomain(domain: { id: string; hostname: string }, mode: "add" | "check" = "check"): Promise<DomainCheck> {
  const provider = await getDomainProvider();
  let result: DomainCheck;
  try {
    result = mode === "add" ? await provider.add(domain.hostname) : await provider.check(domain.hostname);
  } catch (e) {
    console.error("domain provider failed", domain.hostname, e);
    result = { status: "error", records: [], error: "We couldn't reach the domain service. We'll retry automatically." };
  }
  await createAdminClient().rpc("set_domain_status", {
    p_domain_id: domain.id, p_status: result.status,
    p_verification: result.records.length ? result.records : undefined, p_error: result.error ?? undefined,
  });
  return result;
}

const PENDING = ["not_connected", "dns_required", "verifying", "connected", "ssl_pending"];

/** Re-check domains still being set up, at most once a minute each. Returns whether any were checked. */
export async function syncStaleDomains(
  domains: { id: string; hostname: string; status: string; last_checked_at: string | null }[],
): Promise<boolean> {
  const stale = domains.filter((d) => PENDING.includes(d.status)
    && (!d.last_checked_at || Date.now() - new Date(d.last_checked_at).getTime() > 60_000));
  await Promise.all(stale.map((d) => syncDomain(d)));
  return stale.length > 0;
}
