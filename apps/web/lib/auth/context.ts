import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type MembershipStatus =
  | "invitation_sent" | "verification_pending" | "new_staff" | "active"
  | "expired" | "cancelled" | "locked" | "disabled" | "removed";

export interface ActiveMembership {
  membership_id: string;
  restaurant_id: string;
  restaurant_name: string;
  restaurant_slug: string;
  role_key: string;
  role_name: string;
  is_owner: boolean;
  branch_scope: "all" | "selected";
}

export interface PendingMembership {
  membership_id: string;
  restaurant_name: string;
  status: MembershipStatus;
}

export type NextStep =
  | "login" | "verify_phone" | "create_restaurant" | "pending"
  | "restaurant" | "choose_restaurant" | "platform";

export interface MyContext {
  authenticated: boolean;
  next: NextStep;
  user_id?: string;
  full_name?: string | null;
  phone_e164?: string | null;
  email?: string | null;
  locale?: "en" | "ar";
  platform_role?: string | null;
  active_memberships?: ActiveMembership[];
  pending_memberships?: PendingMembership[];
}

/**
 * The database decides where a user goes after login (spec §3). Cached per request.
 */
export const getMyContext = cache(async (): Promise<MyContext> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { authenticated: false, next: "login" };
  const { data, error } = await supabase.rpc("get_my_context");
  if (error) throw error;
  return data as unknown as MyContext;
});

export function pathFor(ctx: MyContext): string {
  switch (ctx.next) {
    case "login": return "/login";
    case "verify_phone": return "/account/phone";
    case "create_restaurant": return "/onboarding/restaurant";
    case "pending": return "/pending";
    case "restaurant": return `/r/${ctx.active_memberships![0].restaurant_id}`;
    case "choose_restaurant": return "/choose";
    case "platform": return "/platform";
  }
}

/** Use at the top of pages that need a signed-in user. */
export async function requireUser(): Promise<MyContext> {
  const ctx = await getMyContext();
  if (!ctx.authenticated) redirect("/login");
  return ctx;
}
