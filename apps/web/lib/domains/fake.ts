import "server-only";
import { type DomainProvider, routingRecord } from "./provider";

const apexOf = (host: string) => host.split(".").slice(-2).join(".");

/**
 * Stand-in when Vercel isn't configured: a new domain asks for DNS records, and the first check
 * reports it active (as if DNS and HTTPS were already set up).
 */
export const fakeDomainProvider: DomainProvider = {
  async add(hostname) {
    return { status: "dns_required", records: [routingRecord(hostname, apexOf(hostname))], error: null };
  },
  async check(hostname) {
    return { status: "active", records: [routingRecord(hostname, apexOf(hostname))], error: null };
  },
  async remove() {},
};
