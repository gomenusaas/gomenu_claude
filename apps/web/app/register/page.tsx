import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "@gomenu/ui";
import Link from "next/link";
import { sendPhoneOtp } from "@/app/actions/auth";
import { ActionForm } from "@/components/action-form";
import { AuthShell } from "@/components/auth-shell";
import { SubmitButton } from "@/components/submit-button";
import { getDictionary } from "@/lib/i18n";

export const metadata = { title: "Create your restaurant" };

export default async function RegisterPage() {
  const { t } = await getDictionary();
  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>{t.register.title}</CardTitle>
          <CardDescription>{t.register.subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <ActionForm action={sendPhoneOtp}>
            <Field id="full_name" label={t.register.fullName}>
              <Input name="full_name" autoComplete="name" required />
            </Field>
            <Field id="phone" label={t.login.mobile} hint={t.login.mobileHint}>
              <Input name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" required />
            </Field>
            <SubmitButton block>{t.login.sendCode}</SubmitButton>
          </ActionForm>
          <p className="text-center text-sm text-muted-foreground">
            {t.register.haveAccount} <Link href="/login" className="text-accent underline">{t.login.title}</Link>
          </p>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
