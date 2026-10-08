import { Card, CardContent, CardHeader, CardTitle, Field, Input } from "@gomenu/ui";
import Link from "next/link";
import { updateName } from "@/app/actions/account";
import { ActionForm } from "@/components/action-form";
import { AuthShell } from "@/components/auth-shell";
import { LogoutButton } from "@/components/logout-button";
import { SubmitButton } from "@/components/submit-button";
import { pathFor, requireUser } from "@/lib/auth/context";
import { getDictionary } from "@/lib/i18n";

export const metadata = { title: "Account" };

// Basic account screen, available to everyone including New Staff.
export default async function AccountPage() {
  const ctx = await requireUser();
  const { t } = await getDictionary();
  return (
    <AuthShell>
      <Card>
        <CardHeader><CardTitle>{t.account.title}</CardTitle></CardHeader>
        <CardContent className="grid gap-5">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{t.account.phone}</dt>
            <dd dir="ltr" className="text-start">{ctx.phone_e164 ?? t.account.none}</dd>
            <dt className="text-muted-foreground">{t.account.email}</dt>
            <dd dir="ltr" className="text-start">{ctx.email ?? t.account.none}</dd>
          </dl>
          <ActionForm action={updateName}>
            <Field id="full_name" label={t.account.fullName}>
              <Input name="full_name" defaultValue={ctx.full_name ?? ""} autoComplete="name" />
            </Field>
            <SubmitButton>{t.common.save}</SubmitButton>
          </ActionForm>
          <div className="flex items-center justify-between">
            <Link href={pathFor(ctx)} className="text-sm text-accent underline">{t.common.back}</Link>
            <LogoutButton label={t.common.logout} />
          </div>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
