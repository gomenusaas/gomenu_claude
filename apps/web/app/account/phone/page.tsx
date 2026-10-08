import { Card, CardContent, CardHeader, CardTitle, Field, Input } from "@gomenu/ui";
import { addPhone, verifyAddedPhone } from "@/app/actions/account";
import { ActionForm } from "@/components/action-form";
import { AuthShell } from "@/components/auth-shell";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth/context";
import { getDictionary } from "@/lib/i18n";
import { toE164 } from "@/lib/phone";

export const metadata = { title: "Verify your mobile" };

// Accounts must have a verified mobile before creating a restaurant.
export default async function AddPhonePage({ searchParams }: { searchParams: Promise<{ phone?: string }> }) {
  await requireUser();
  const { t } = await getDictionary();
  const phone = toE164((await searchParams).phone ?? "");
  return (
    <AuthShell>
      <Card>
        <CardHeader><CardTitle>{t.login.mobile}</CardTitle></CardHeader>
        <CardContent>
          {phone ? (
            <ActionForm action={verifyAddedPhone}>
              <input type="hidden" name="phone" value={phone} />
              <Field id="code" label={t.verify.code}>
                <Input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} dir="ltr" required />
              </Field>
              <SubmitButton block>{t.verify.submit}</SubmitButton>
            </ActionForm>
          ) : (
            <ActionForm action={addPhone}>
              <Field id="phone" label={t.login.mobile} hint={t.login.mobileHint}>
                <Input name="phone" type="tel" inputMode="tel" dir="ltr" required />
              </Field>
              <SubmitButton block>{t.login.sendCode}</SubmitButton>
            </ActionForm>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
