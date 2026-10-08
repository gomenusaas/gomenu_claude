import { parsePhoneNumberFromString } from "libphonenumber-js";

/** Normalise user input to E.164. Oman (+968) is assumed when no country code is given. */
export function toE164(input: string): string | null {
  const parsed = parsePhoneNumberFromString(input.trim(), "OM");
  return parsed?.isValid() ? parsed.number : null;
}
