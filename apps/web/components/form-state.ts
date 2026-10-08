export type FormState = { error?: string; ok?: string; reauth?: boolean } | undefined;

/**
 * Map a database error to form state. Errors that need a fresh OTP (re-authentication) carry
 * the hint REAUTH_REQUIRED; the form then shows `reauthLabel` as a link to /reauth.
 */
export function dbError(
  error: { message: string; hint?: string | null; code?: string } | null,
  reauthLabel: string,
): FormState {
  if (!error) return undefined;
  if (error.hint === "REAUTH_REQUIRED") return { error: reauthLabel, reauth: true };
  return { error: error.message };
}
