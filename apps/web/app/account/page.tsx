import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "@gomenu/ui";
import Link from "next/link";
import { updateName } from "@/app/actions/account";
import { logoutAllDevices, revokeDevice, setMyPin } from "@/app/actions/security";
import { ActionForm } from "@/components/action-form";
import { AuthShell } from "@/components/auth-shell";
import { LogoutButton } from "@/components/logout-button";
import { SubmitButton } from "@/components/submit-button";
import { pathFor, requireUser } from "@/lib/auth/context";
import { formatDate } from "@/lib/format";
import { fmt, getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Account" };

// Basic account + security, available to everyone including New Staff (spec §4).
export default async function AccountPage() {
  const ctx = await requireUser();
  const { locale, t } = await getDictionary();
  const supabase = await createClient();
  const [{ data: devices }, { data: hasPin }] = await Promise.all([
    supabase.from("user_devices").select("id, label, last_seen_at, trusted_at, revoked_at")
      .eq("user_id", ctx.user_id!).order("last_seen_at", { ascending: false }),
    supabase.rpc("my_pin_is_set"),
  ]);
  return (
    <AuthShell>
      <div className="grid gap-4">
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
          </CardContent>
        </Card>

        <Card data-testid="pin-card">
          <CardHeader>
            <CardTitle as="h2" className="text-base">{t.security.pinSection}</CardTitle>
            <CardDescription>{hasPin ? t.security.pinSet : t.security.pinNotSet}</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={setMyPin}>
              <Field id="new_pin" label={t.pin.pin}><Input name="pin" type="password" inputMode="numeric" maxLength={6} dir="ltr" required /></Field>
              <Field id="new_pin_confirm" label={t.pin.confirm}><Input name="confirm" type="password" inputMode="numeric" maxLength={6} dir="ltr" required /></Field>
              <SubmitButton variant="outline">{t.security.changePin}</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle as="h2" className="text-base">{t.security.devices}</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <ul className="grid gap-2 text-sm">
              {(devices ?? []).map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2" data-testid="device-row">
                  <span>{d.label ?? "—"} · {fmt(t.security.lastSeen, { date: formatDate(d.last_seen_at, locale) })}</span>
                  <span className="flex items-center gap-2">
                    <Badge tone={d.revoked_at ? "neutral" : "success"}>{d.revoked_at ? t.security.revoked : t.security.trusted}</Badge>
                    {d.revoked_at ? null : (
                      <form action={revokeDevice}>
                        <input type="hidden" name="device_id" value={d.id} />
                        <Button size="sm" variant="ghost" type="submit">{t.security.revoke}</Button>
                      </form>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">{t.security.logoutAllBody}</p>
            <form action={logoutAllDevices}>
              <Button type="submit" variant="destructive" size="sm">{t.security.logoutAll}</Button>
            </form>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <Link href={pathFor(ctx)} className="text-sm text-accent underline">{t.common.back}</Link>
          <LogoutButton label={t.common.logout} />
        </div>
      </div>
    </AuthShell>
  );
}
