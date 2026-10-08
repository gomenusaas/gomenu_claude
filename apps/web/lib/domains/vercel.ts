import "server-only";
import { type DnsRecord, type DomainCheck, type DomainProvider, routingRecord } from "./provider";

type ProjectDomain = {
  name: string;
  apexName: string;
  verified: boolean;
  verification?: { type: string; domain: string; value: string; reason: string }[];
};
type DomainConfig = {
  misconfigured: boolean;
  recommendedIPv4?: { rank: number; value: string[] }[];
  recommendedCNAME?: { rank: number; value: string }[];
};
class VercelError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/**
 * Vercel verifies ownership (TXT, only when the domain is used by another Vercel account),
 * checks DNS, and issues the HTTPS certificate automatically once DNS points at Vercel.
 */
export function vercelProvider(token: string, projectId: string, teamId?: string): DomainProvider {
  async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = new URL(`https://api.vercel.com${path}`);
    if (teamId) url.searchParams.set("teamId", teamId);
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const json = res.status === 204 ? {} : await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: string } }).error;
      throw new VercelError(res.status, err?.code ?? "error", err?.message ?? `Vercel API ${res.status}`);
    }
    return json as T;
  }

  /** HTTPS answers once the certificate is issued; until then the domain is "SSL pending". */
  async function httpsReady(hostname: string): Promise<boolean> {
    try {
      await fetch(`https://${hostname}/`, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(5_000) });
      return true;
    } catch {
      return false;
    }
  }

  async function status(domain: ProjectDomain): Promise<DomainCheck> {
    const config = await api<DomainConfig>("GET", `/v6/domains/${encodeURIComponent(domain.name)}/config`);
    const ipv4 = config.recommendedIPv4?.sort((a, b) => a.rank - b.rank)[0]?.value[0];
    const cname = config.recommendedCNAME?.sort((a, b) => a.rank - b.rank)[0]?.value?.replace(/\.$/, "");
    const records: DnsRecord[] = [routingRecord(domain.name, domain.apexName, ipv4, cname)];
    for (const v of domain.verification ?? []) {
      if (v.type === "TXT") records.push({ type: "TXT", name: v.domain.replace(`.${domain.apexName}`, ""), value: v.value });
    }
    if (!domain.verified) return { status: "verifying", records, error: null };
    if (config.misconfigured) return { status: "dns_required", records, error: null };
    return { status: (await httpsReady(domain.name)) ? "active" : "ssl_pending", records, error: null };
  }

  const project = `/projects/${encodeURIComponent(projectId)}/domains`;

  return {
    async add(hostname) {
      try {
        return await status(await api<ProjectDomain>("POST", `/v10${project}`, { name: hostname }));
      } catch (e) {
        if (e instanceof VercelError && e.code === "domain_already_in_use") {
          return { status: "error", records: [], error: "This domain is already used by another website." };
        }
        throw e;
      }
    },
    async check(hostname) {
      let domain: ProjectDomain;
      try {
        domain = await api<ProjectDomain>("GET", `/v9${project}/${encodeURIComponent(hostname)}`);
      } catch (e) {
        if (e instanceof VercelError && e.status === 404) return { status: "disconnected", records: [], error: null };
        throw e;
      }
      if (!domain.verified) {
        domain = await api<ProjectDomain>("POST", `/v9${project}/${encodeURIComponent(hostname)}/verify`).catch(() => domain);
      }
      return status(domain);
    },
    async remove(hostname) {
      await api("DELETE", `/v9${project}/${encodeURIComponent(hostname)}`).catch((e) => {
        if (!(e instanceof VercelError && e.status === 404)) throw e;
      });
    },
  };
}
