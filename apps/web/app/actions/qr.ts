"use server";

import { revalidatePath } from "next/cache";
import { dbError, type FormState } from "@/components/form-state";
import { getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function run(fd: FormData, fn: (supabase: Awaited<ReturnType<typeof createClient>>) => PromiseLike<{ error: { message: string; code?: string; hint?: string | null } | null }>): Promise<FormState> {
  const { t } = await getDictionary();
  const supabase = await createClient();
  const { error } = await fn(supabase);
  if (error) return error.code === "23505" ? { error: t.qr.labelTaken } : dbError(error, t.security.reauthPrompt);
  revalidatePath(`/r/${s(fd, "restaurant_id")}/qr`);
  return undefined;
}

export async function createGeneralQr(_: FormState, fd: FormData) {
  return run(fd, (sb) => sb.rpc("create_general_qr", { p_restaurant_id: s(fd, "restaurant_id"), p_label: s(fd, "label") }));
}
export async function revokeGeneralQr(_: FormState, fd: FormData) {
  return run(fd, (sb) => sb.rpc("revoke_general_qr", { p_qr_id: s(fd, "id") }));
}
export async function addTable(_: FormState, fd: FormData) {
  if (!s(fd, "label")) return { error: (await getDictionary()).t.menu.nameRequired };
  return run(fd, (sb) => sb.rpc("create_table", { p_branch_id: s(fd, "branch_id"), p_label: s(fd, "label"), p_section: s(fd, "section") }));
}
export async function regenerateTableQr(_: FormState, fd: FormData) {
  return run(fd, (sb) => sb.rpc("regenerate_table_qr", { p_table_id: s(fd, "id") }));
}
export async function setTableActive(_: FormState, fd: FormData) {
  return run(fd, (sb) => sb.rpc("set_table_active", { p_table_id: s(fd, "id"), p_active: s(fd, "active") === "true" }));
}
export async function archiveTable(_: FormState, fd: FormData) {
  return run(fd, (sb) => sb.rpc("archive_table", { p_table_id: s(fd, "id") }));
}
