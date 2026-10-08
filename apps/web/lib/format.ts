import type { Locale } from "@/lib/i18n";

// Minor units per currency (OMR has 3 decimals). Amounts are always stored as integers.
const EXPONENT: Record<string, number> = { USD: 2, EUR: 2, GBP: 2, AED: 2, SAR: 2, OMR: 3, BHD: 3, KWD: 3 };

export function formatMoney(minor: number, currency: string, locale: Locale): string {
  const exponent = EXPONENT[currency] ?? 2;
  const value = minor / 10 ** exponent;
  const digits = minor % 10 ** exponent === 0 ? 0 : exponent;
  return new Intl.NumberFormat(locale === "ar" ? "ar-OM" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: exponent,
  }).format(value);
}

export function formatDate(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-OM" : "en-GB", { dateStyle: "medium" }).format(new Date(iso));
}

export function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export function isWithinDays(iso: string, days: number): boolean {
  return new Date(iso).getTime() - Date.now() <= days * 86_400_000;
}
