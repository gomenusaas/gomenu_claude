import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "@gomenu/ui";
import { sendReauthOtp, verifyPhoneOtp } from "@/app/actions/auth";
import { ActionForm } from "@/components/action-form";
import { AuthShell } from "@/components/auth-shell";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth/context";
import { fmt, getDictionary } from "@/lib/i18n";

export const metadata = { title: "Confirm it's you" };

// Re-authentication (decision P3-Q6): a fresh OTP keeps sensitive changes allowed for 10 minutes.
export default async function ReauthPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const ctx = await requireUser();
  const { t } = await getDictionary();
  const next = (await searchParams).next ?? "/app";
  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>{t.security.reauthTitle}</CardTitle>
          <CardDescription>{fmt(t.security.reauthBody, { phone: `⁦${ctx.phone_e164 ?? ""}⁩` })}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ActionForm action={sendReauthOtp}>
            <SubmitButton variant="outline" block>{t.security.sendCode}</SubmitButton>
          </ActionForm>
          <ActionForm action={verifyPhoneOtp}>
            <input type="hidden" name="phone" value={ctx.phone_e164 ?? ""} />
            <input type="hidden" name="next" value={next} />
            <Field id="code" label={t.verify.code}>
              <Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" required />
            </Field>
            <SubmitButton block>{t.verify.submit}</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
