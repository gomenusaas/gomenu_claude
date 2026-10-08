import { Card, CardContent, CardHeader, CardTitle, Field, Input } from "@gomenu/ui";
import Link from "next/link";
import { sendPhoneOtp, loginWithEmail } from "@/app/actions/auth";
import { ActionForm } from "@/components/action-form";
import { AuthShell } from "@/components/auth-shell";
import { SubmitButton } from "@/components/submit-button";
import { getDictionary } from "@/lib/i18n";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ method?: string }> }) {
  const { t } = await getDictionary();
  const method = (await searchParams).method === "email" ? "email" : "mobile";
  const tab = (active: boolean) =>
    `flex-1 rounded-md px-3 py-2 text-center text-sm font-medium ${active ? "bg-background shadow-sm" : "text-muted-foreground"}`;

  return (
    <AuthShell>
      <Card>
        <CardHeader><CardTitle>{t.login.title}</CardTitle></CardHeader>
        <CardContent className="grid gap-5">
          <nav className="flex gap-1 rounded-lg bg-muted p-1" aria-label={t.login.title}>
            <Link href="/login" className={tab(method === "mobile")} aria-current={method === "mobile" ? "page" : undefined}>
              {t.login.tabMobile}
            </Link>
            <Link href="/login?method=email" className={tab(method === "email")} aria-current={method === "email" ? "page" : undefined}>
              {t.login.tabEmail}
            </Link>
          </nav>

          {method === "mobile" ? (
            <ActionForm action={sendPhoneOtp}>
              <Field id="phone" label={t.login.mobile} hint={t.login.mobileHint}>
                <Input name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" required />
              </Field>
              <SubmitButton block>{t.login.sendCode}</SubmitButton>
            </ActionForm>
          ) : (
            <ActionForm action={loginWithEmail}>
              <Field id="email" label={t.login.email}>
                <Input name="email" type="email" autoComplete="email" dir="ltr" required />
              </Field>
              <Field id="password" label={t.login.password}>
                <Input name="password" type="password" autoComplete="current-password" required />
              </Field>
              <SubmitButton block>{t.login.submit}</SubmitButton>
            </ActionForm>
          )}

          <p className="text-center text-sm text-muted-foreground">
            {t.login.newHere} <Link href="/register" className="text-accent underline">{t.login.createAccount}</Link>
          </p>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
