import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "@gomenu/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { setStaffPin } from "@/app/actions/invite";
import { ActionForm } from "@/components/action-form";
import { AuthShell } from "@/components/auth-shell";
import { LogoutButton } from "@/components/logout-button";
import { SubmitButton } from "@/components/submit-button";
import { pathFor, requireUser } from "@/lib/auth/context";
import { fmt, getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { PendingRefresh } from "./refresh";

export const metadata = { title: "Pending" };

// The New Staff screen (spec §4.5): status, account/security, logout — nothing else.
export default async function PendingPage() {
  const ctx = await requireUser();
  if (ctx.next !== "pending") redirect(pathFor(ctx));
  const { t } = await getDictionary();
  const pending = ctx.pending_memberships ?? [];
  const needsPin = pending.find((m) => m.status === "verification_pending");

  if (needsPin) {
    const supabase = await createClient();
    const { data: hasPin } = await supabase.rpc("my_pin_is_set");
    return (
      <AuthShell>
        <Card>
          <CardHeader>
            <CardTitle>{hasPin ? t.pin.existingTitle : t.pin.title}</CardTitle>
            <CardDescription>
              {fmt(t.pending.needsPin, { restaurant: needsPin.restaurant_name })}{" "}
              {hasPin ? t.pin.existingHelp : t.pin.help}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={setStaffPin}>
              <input type="hidden" name="membership_id" value={needsPin.membership_id} />
              <Field id="pin" label={t.pin.pin}>
                <Input name="pin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} dir="ltr" required />
              </Field>
              {hasPin ? null : (
                <Field id="confirm" label={t.pin.confirm}>
                  <Input name="confirm" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} dir="ltr" required />
                </Field>
              )}
              <SubmitButton block>{t.pin.submit}</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>{t.pending.title}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {pending.map((m) => (
            <div key={m.membership_id} className="grid gap-2 rounded-md border p-3" data-testid="pending-membership">
              <div className="font-medium">{m.restaurant_name}</div>
              <p className="text-sm text-muted-foreground">{fmt(t.pending.body, { restaurant: m.restaurant_name })}</p>
              <div className="flex items-center gap-2 text-sm">
                {t.pending.status}: <Badge tone="accent">{t.status[m.status]}</Badge>
              </div>
            </div>
          ))}
          <PendingRefresh label={t.pending.refresh} />
          <div className="flex items-center justify-between">
            <Link href="/account" className="text-sm text-accent underline">{t.account.title}</Link>
            <LogoutButton label={t.common.logout} />
          </div>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
