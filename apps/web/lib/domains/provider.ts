import "server-only";
import type { Database } from "@/lib/database.types";
import { serverEnv } from "@/lib/server-env";

export type DomainStatus = Database["public"]["Enums"]["domain_status"];
export type DnsRecord = { type: "A" | "CNAME" | "TXT"; name: string; value: string };
export type DomainCheck = { status: DomainStatus; records: DnsRecord[]; error: string | null };

export interface DomainProvider {
  add(hostname: string): Promise<DomainCheck>;
  check(hostname: string): Promise<DomainCheck>;
  remove(hostname: string): Promise<void>;
}

/** The DNS records an owner creates: A for an apex domain, CNAME for www/subdomains. */
export function routingRecord(hostname: string, apex: string, ipv4 = "76.76.21.21", cname = "cname.vercel-dns.com"): DnsRecord {
  if (hostname === apex) return { type: "A", name: "@", value: ipv4 };
  return { type: "CNAME", name: hostname.slice(0, -(apex.length + 1)), value: cname };
}

/** Decision P3-Q4: Vercel Domains API. Without VERCEL_TOKEN a stand-in is used (dev/tests). */
export async function getDomainProvider(): Promise<DomainProvider> {
  if (serverEnv.VERCEL_TOKEN && serverEnv.VERCEL_PROJECT_ID) {
    return (await import("./vercel")).vercelProvider(serverEnv.VERCEL_TOKEN, serverEnv.VERCEL_PROJECT_ID, serverEnv.VERCEL_TEAM_ID);
  }
  return (await import("./fake")).fakeDomainProvider;
}
