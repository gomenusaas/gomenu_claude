import "server-only";
import { cookies } from "next/headers";
import { ar } from "./ar";
import { en, type Dictionary } from "./en";

export type Locale = "en" | "ar";
export const LOCALE_COOKIE = "gm_locale";

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return value === "ar" ? "ar" : "en";
}

export async function getDictionary(): Promise<{ locale: Locale; t: Dictionary }> {
  const locale = await getLocale();
  return { locale, t: locale === "ar" ? ar : en };
}

/** Replace {placeholders} in a message. */
export function fmt(message: string, values: Record<string, string | number>) {
  return message.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}
