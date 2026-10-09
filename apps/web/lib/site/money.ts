import { intlLocale } from "./strings";

// Currencies with three minor digits (the Omani rial and neighbours).
const EXP: Record<string, number> = { OMR: 3, BHD: 3, KWD: 3 };

/** Format minor units (e.g. baisa) as a price in the visitor's language. */
export function money(minor: number, currency: string, locale: string) {
  const exp = EXP[currency] ?? 2;
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency", currency, minimumFractionDigits: minor % 10 ** exp === 0 ? 0 : exp, maximumFractionDigits: exp,
  }).format(minor / 10 ** exp);
}
