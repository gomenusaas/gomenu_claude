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

/** Milliseconds `timeZone` is ahead of UTC at `date`. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** A `datetime-local` value entered in the restaurant's time zone → ISO timestamp. */
export function zonedLocalToIso(local: string, timeZone: string): string {
  const guess = Date.parse(`${local}:00Z`);
  return new Date(guess - tzOffsetMs(new Date(guess), timeZone)).toISOString();
}

/** ISO timestamp → `datetime-local` value in the restaurant's time zone. */
export function isoToZonedLocal(iso: string, timeZone: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() + tzOffsetMs(d, timeZone)).toISOString().slice(0, 16);
}
