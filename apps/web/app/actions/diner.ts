"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/form-state";
import { getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

async function signedIn() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/me/login?next=/me");
  return { supabase, userId: data.user.id };
}

export async function saveDinerProfile(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const { supabase, userId } = await signedIn();
  const { error } = await supabase.from("profiles").update({
    full_name: String(fd.get("full_name") ?? "").trim() || null,
    locale: fd.get("locale") === "ar" ? "ar" : "en",
    analytics_opt_out: fd.get("analytics_opt_out") === "on",
    marketing_opt_in: fd.get("marketing_opt_in") === "on",
  }).eq("id", userId);
  if (error) return { error: t.common.unexpectedError };
  revalidatePath("/me");
  return { ok: t.common.saved };
}

export async function removeFavorite(_: FormState, fd: FormData): Promise<FormState> {
  const { supabase } = await signedIn();
  await supabase.from("diner_favorites").delete().eq("id", String(fd.get("id") ?? ""));
  revalidatePath("/me");
  return undefined;
}

export async function deleteMyDinerData(): Promise<FormState> {
  const { t } = await getDictionary();
  const { supabase } = await signedIn();
  const { error } = await supabase.rpc("delete_my_diner_data");
  if (error) return { error: t.common.unexpectedError };
  revalidatePath("/me");
  return { ok: t.diner.deleted };
}
