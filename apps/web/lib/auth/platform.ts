import "server-only";
import { notFound } from "next/navigation";
import { getMyContext } from "./context";

/**
 * Page-level guard for the platform console. The database independently refuses every
 * platform RPC/read without the right role + MFA; this just avoids rendering forms that
 * would only fail.
 */
export async function requirePlatformRole(roles: string[]) {
  const ctx = await getMyContext();
  if (!ctx.platform_role || !roles.includes(ctx.platform_role) || ctx.aal !== "aal2") notFound();
  return ctx;
}
