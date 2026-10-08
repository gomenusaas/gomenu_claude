"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbError, type FormState } from "@/components/form-state";
import { AiError, getAiProvider, type MenuFile, toImportPayload, TranslationSet } from "@/lib/ai/provider";
import { toMinor } from "@/lib/format";
import { fmt, getDictionary } from "@/lib/i18n";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const MEDIA_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;

function aiMessage(e: unknown, t: Awaited<ReturnType<typeof getDictionary>>["t"]): string {
  if (e instanceof AiError) return e.code === "not_configured" ? t.ai.notConfigured : e.message;
  console.error("AI request failed", e);
  return t.ai.unavailable;
}

/**
 * Read a menu file that the browser uploaded to {restaurant}/imports/. The job is created as the
 * signed-in person (permission, plan and credit checks); only the AI result is recorded with the
 * service role, through RPCs that are not callable by browsers.
 */
export async function runMenuImport(restaurantId: string, path: string, mediaType: string): Promise<{ jobId?: string; error?: string }> {
  const { t } = await getDictionary();
  if (!path.startsWith(`${restaurantId}/imports/`) || !MEDIA_TYPES.includes(mediaType as MenuFile["mediaType"])) {
    return { error: t.ai.fileInvalid };
  }
  const supabase = await createClient();
  const { data: jobId, error } = await supabase.rpc("start_menu_import", { p_restaurant_id: restaurantId, p_source_path: path });
  if (error || !jobId) return { error: dbError(error, t.security.reauthPrompt)?.error ?? t.common.unexpectedError };

  const admin = createAdminClient();
  try {
    const { data: r } = await supabase.from("restaurants").select("currency, default_locale").eq("id", restaurantId).single();
    const { data: blob, error: dlError } = await admin.storage.from("restaurant-private").download(path);
    if (dlError || !blob) throw new AiError("unreadable", t.ai.fileInvalid);
    const file: MenuFile = { data: Buffer.from(await blob.arrayBuffer()), mediaType: mediaType as MenuFile["mediaType"] };
    const provider = await getAiProvider();
    const extraction = await provider.extractMenu(file, { locale: r?.default_locale ?? "en", currency: r?.currency ?? "OMR" });
    const payload = toImportPayload(extraction, r?.currency ?? "OMR");
    if (!payload.categories.length) throw new AiError("unreadable", t.ai.nothingFound);
    const { error: doneError } = await admin.rpc("complete_menu_import", { p_job_id: jobId, p_result: payload });
    if (doneError) throw doneError;
  } catch (e) {
    await admin.rpc("fail_ai_job", { p_job_id: jobId, p_error: aiMessage(e, t) });
  }
  revalidatePath(`/r/${restaurantId}`, "layout");
  return { jobId };
}

/** The reviewed import: fields cat:{c}:name and item:{c}:{i}:{include|name|description|price}. */
export async function publishImport(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const restaurantId = s(fd, "restaurant_id");
  const supabase = await createClient();
  const { data: r } = await supabase.from("restaurants").select("currency").eq("id", restaurantId).single();
  const categories: { name: string; items: { name: string; description: string | null; price_minor: number }[] }[] = [];
  for (let c = 0; fd.has(`cat:${c}:name`); c++) {
    const items = [];
    for (let i = 0; fd.has(`item:${c}:${i}:name`); i++) {
      if (fd.get(`item:${c}:${i}:include`) !== "on") continue;
      const price = toMinor(s(fd, `item:${c}:${i}:price`) || "0", r?.currency ?? "OMR");
      if (price === null) return { error: t.menu.priceInvalid };
      items.push({ name: s(fd, `item:${c}:${i}:name`), description: s(fd, `item:${c}:${i}:description`) || null, price_minor: price });
    }
    categories.push({ name: s(fd, `cat:${c}:name`), items });
  }
  const { error } = await supabase.rpc("apply_menu_import", { p_job_id: s(fd, "job_id"), p_payload: { categories } });
  if (error) return dbError(error, t.security.reauthPrompt);
  revalidatePath(`/r/${restaurantId}`, "layout");
  redirect(`/r/${restaurantId}/menu`);
}

export async function unlockJob(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const supabase = await createClient();
  const { error } = await supabase.rpc("unlock_ai_job", { p_job_id: s(fd, "job_id") });
  if (error) return dbError(error, t.security.reauthPrompt);
  revalidatePath(`/r/${s(fd, "restaurant_id")}`, "layout");
  return { ok: t.common.saved };
}

export async function cancelJob(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_ai_job", { p_job_id: s(fd, "job_id") });
  if (error) return dbError(error, t.security.reauthPrompt);
  revalidatePath(`/r/${s(fd, "restaurant_id")}`, "layout");
  redirect(`/r/${s(fd, "restaurant_id")}/menu/import`);
}

/** Translate the whole menu (or one category) into an active language; results are AI drafts. */
export async function runTranslation(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const restaurantId = s(fd, "restaurant_id");
  const scope = s(fd, "category_id") ? { type: "category", id: s(fd, "category_id") } : { type: "menu" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_translation", {
    p_restaurant_id: restaurantId, p_target_locale: s(fd, "locale"), p_scope: scope,
  });
  if (error || !data) return dbError(error, t.security.reauthPrompt) ?? { error: t.common.unexpectedError };
  const job = data as { job_id: string; source_locale: string; target_locale: string; item_count: number; source: unknown };

  const admin = createAdminClient();
  try {
    const source = TranslationSet.parse(normaliseSource(job.source));
    const { data: r } = await supabase.from("restaurants").select("name").eq("id", restaurantId).single();
    const provider = await getAiProvider();
    const translated = await provider.translate(source, { from: job.source_locale, to: job.target_locale, restaurantName: r?.name ?? "" });
    const { data: status, error: doneError } = await admin.rpc("complete_translation", { p_job_id: job.job_id, p_translated: translated });
    if (doneError) throw doneError;
    revalidatePath(`/r/${restaurantId}`, "layout");
    return status === "needs_credits" ? { error: fmt(t.ai.needsCredits, { n: job.item_count }) }
      : { ok: fmt(t.ai.translated, { n: job.item_count }) };
  } catch (e) {
    const message = aiMessage(e, t);
    await admin.rpc("fail_ai_job", { p_job_id: job.job_id, p_error: message });
    revalidatePath(`/r/${restaurantId}`, "layout");
    return { error: message };
  }
}

/** Source texts can be null where a language has no text yet; send empty strings instead. */
function normaliseSource(source: unknown) {
  const src = (source ?? {}) as Record<string, { id: string; name: string | null; description?: string | null }[] | null>;
  const named = (k: string) => (src[k] ?? []).map((e) => ({ id: e.id, name: e.name ?? "" }));
  return {
    items: (src.items ?? []).map((e) => ({ id: e.id, name: e.name ?? "", description: e.description || null })),
    categories: named("categories"),
    variants: named("variants"),
    option_groups: named("option_groups"),
    options: named("options"),
  };
}

export async function buyCredits(_: FormState, fd: FormData): Promise<FormState> {
  const { t } = await getDictionary();
  const restaurantId = s(fd, "restaurant_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("buy_ai_credits", { p_restaurant_id: restaurantId, p_packs: Number(s(fd, "packs")) || 1 });
  if (error) return dbError(error, t.security.reauthPrompt);
  revalidatePath(`/r/${restaurantId}`, "layout");
  return { ok: t.ai.invoiceIssued };
}
