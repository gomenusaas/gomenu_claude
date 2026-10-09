import "server-only";
import { headers } from "next/headers";
import { publicEnv } from "@/lib/env";
import { testGateway } from "./test-gateway";
import type { GatewayAdapter } from "./types";

const ADAPTERS: Record<string, GatewayAdapter> = { test: testGateway };

export function adapterFor(provider: string): GatewayAdapter | null {
  return ADAPTERS[provider] ?? null;
}

/** This deployment's own address (for return URLs and the test gateway's webhooks). */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
  return host ? `${proto}://${host}` : publicEnv.NEXT_PUBLIC_APP_URL;
}
