import "server-only";
import { createClient } from "@/lib/supabase/server";

export interface PublicPricing {
  currency: string;
  trial_months: number;
  extra_branch_amount_minor: number;
  features: { key: string; kind: "flag" | "limit"; category: string; name: string }[];
  plans: {
    key: string;
    name: string;
    description: string | null;
    amount_minor: number;
    entitlements: Record<string, { enabled: boolean; limit: number | null }>;
  }[];
}

/** Plans, prices and entitlements straight from the database (never hard-coded). */
export async function getPublicPricing(): Promise<PublicPricing> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_pricing");
  if (error) throw error;
  return data as unknown as PublicPricing;
}
