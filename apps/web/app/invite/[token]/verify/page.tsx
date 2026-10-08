import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "@gomenu/ui";
import { redirect } from "next/navigation";
import { verifyInvitationOtp } from "@/app/actions/invite";
import { ActionForm } from "@/components/action-form";
import { AuthShell } from "@/components/auth-shell";
import { SubmitButton } from "@/components/submit-button";
import { fmt, getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Verify", robots: { index: false } };

export default async function InvitationVerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_invitation_preview", { p_token: token });
  const preview = data as { status: string; phone_masked?: string } | null;
  if (preview?.status !== "valid") redirect(`/invite/${encodeURIComponent(token)}`);
  const { t } = await getDictionary();

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>{t.verify.title}</CardTitle>
          <CardDescription>{fmt(t.verify.subtitle, { phone: `⁦${preview.phone_masked}⁩` })}</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={verifyInvitationOtp.bind(null, token)}>
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
