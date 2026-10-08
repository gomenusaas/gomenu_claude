import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@gomenu/ui";
import { sendInvitationOtp } from "@/app/actions/invite";
import { ActionForm } from "@/components/action-form";
import { AuthShell } from "@/components/auth-shell";
import { SubmitButton } from "@/components/submit-button";
import { fmt, getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Invitation", robots: { index: false } };

type Preview =
  | { status: "valid"; restaurant_name: string; staff_name: string; phone_masked: string }
  | { status: "invalid" | "expired" | "cancelled" | "consumed" | "replaced" | "opened" | "pending" };

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { t } = await getDictionary();
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_invitation_preview", { p_token: token });
  const preview = (data ?? { status: "invalid" }) as Preview;

  if (preview.status !== "valid") {
    const key = (["expired", "cancelled", "consumed", "replaced"] as const).find((s) => s === preview.status) ?? "invalid";
    return (
      <AuthShell>
        <Alert tone="warning" className="mt-8">{t.invite[key]}</Alert>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>{fmt(t.invite.title, { restaurant: preview.restaurant_name })}</CardTitle>
          <CardDescription>
            {fmt(t.invite.greeting, { name: preview.staff_name })}{" "}
            {fmt(t.invite.explain, { phone: `⁦${preview.phone_masked}⁩` })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={sendInvitationOtp.bind(null, token)}>
            <SubmitButton block>{t.invite.sendCode}</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
