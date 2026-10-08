"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/form-state";
import { publicEnv } from "@/lib/env";
import { getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/;

export async function createRestaurant(_: FormState, formData: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const branch = String(formData.get("branch") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!name) return { error: t.common.unexpectedError };
  if (!SLUG.test(slug)) return { error: t.onboarding.slugInvalid };

  const supabase = await createClient();
  const { data: restaurantId, error } = await supabase.rpc("create_restaurant", {
    p_name: name,
    p_slug: slug,
    p_branch_name: branch || undefined,
  });
  if (error) return { error: error.code === "23505" ? t.onboarding.slugTaken : error.message };

  // Optional second login method (decision Q4): email + password on the same identity.
  // The email only becomes usable after the confirmation link is clicked.
  if (password.length >= 8) await supabase.auth.updateUser({ password });
  if (email) {
    await supabase.auth.updateUser(
      { email },
      { emailRedirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/confirm` },
    );
  }
  redirect(`/r/${restaurantId}`);
}
