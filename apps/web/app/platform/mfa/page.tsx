import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "@gomenu/ui";
import { redirect } from "next/navigation";
import { verifyTotp } from "@/app/actions/platform-auth";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { getMyContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { EnrollAuthenticator } from "./enroll";

export const metadata = { title: "Verify", robots: { index: false } };

export default async function PlatformMfa() {
  const ctx = await getMyContext();
  if (!ctx.authenticated) redirect("/platform/login");
  if (!ctx.platform_role) redirect("/app");
  const supabase = await createClient();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") redirect("/platform");
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp.find((f) => f.status === "verified");

  return (
    <main className="mx-auto max-w-md px-4 py-16" dir="ltr">
      <Card>
        <CardHeader>
          <CardTitle>{verified ? "Enter your code" : "Protect your account"}</CardTitle>
          <CardDescription>
            {verified
              ? "Open your authenticator app and enter the 6-digit code for GoMenu."
              : "Platform access requires an authenticator app (multi-factor authentication)."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {verified ? (
            <ActionForm action={verifyTotp}>
              <input type="hidden" name="factor_id" value={verified.id} />
              <Field id="code" label="6-digit code"><Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required /></Field>
              <SubmitButton block>Verify</SubmitButton>
            </ActionForm>
          ) : (
            <EnrollAuthenticator />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
