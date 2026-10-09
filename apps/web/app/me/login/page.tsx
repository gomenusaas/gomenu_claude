import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "@gomenu/ui";
import { redirect } from "next/navigation";
import { sendPhoneOtp } from "@/app/actions/auth";
import { ActionForm } from "@/components/action-form";
import { AuthShell } from "@/components/auth-shell";
import { SubmitButton } from "@/components/submit-button";
import { getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Sign in", robots: { index: false } };

/** Diner sign-in (spec §12: mobile + OTP). Returns to the restaurant page the diner came from. */
export default async function DinerLogin({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const raw = (await searchParams).next ?? "/me";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/me";
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect(next);
  const { t } = await getDictionary();
  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>{t.diner.loginTitle}</CardTitle>
          <CardDescription>{t.diner.loginBody}</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={sendPhoneOtp}>
            <input type="hidden" name="next" value={next} />
            <Field id="phone" label={t.login.mobile} hint={t.login.mobileHint}>
              <Input name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" required />
            </Field>
            <Field id="full_name" label={t.diner.name}>
              <Input name="full_name" autoComplete="name" />
            </Field>
            <SubmitButton block>{t.login.sendCode}</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
