import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@gomenu/ui";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { getDeviceToken } from "@/lib/auth/device";
import { getDictionary } from "@/lib/i18n";
import { createAdminClient } from "@/lib/supabase/admin";
import { PinForm } from "./pin-form";

export const metadata = { title: "Locked", robots: { index: false } };
export const dynamic = "force-dynamic";

type Parked = { user_id: string; full_name: string | null; phone_masked: string | null };

// Staff switcher for shared devices: names of people with a locked session on THIS device.
export default async function LockPage({ searchParams }: { searchParams: Promise<{ user?: string; untrusted?: string }> }) {
  const { user, untrusted } = await searchParams;
  const { t } = await getDictionary();
  const token = await getDeviceToken();
  const { data } = token ? await createAdminClient().rpc("list_parked_sessions", { p_device_token: token }) : { data: [] };
  const parked = (data ?? []) as unknown as Parked[];
  const selected = parked.find((p) => p.user_id === user);

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>{selected ? selected.full_name ?? selected.phone_masked : t.security.lockTitle}</CardTitle>
          <CardDescription>{selected ? t.security.enterPin : t.security.lockBody}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {untrusted ? <Alert tone="warning">{t.security.lockUntrusted}</Alert> : null}
          {selected ? (
            <>
              <PinForm userId={selected.user_id} labels={{ pin: t.pin.pin, unlock: t.security.unlock }} />
              <Link href="/lock" className="text-sm text-accent underline">{t.common.back}</Link>
            </>
          ) : parked.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.security.noParked}</p>
          ) : (
            <ul className="grid gap-2">
              {parked.map((p) => (
                <li key={p.user_id}>
                  <Link href={`/lock?user=${p.user_id}`} className="flex items-center justify-between rounded-md border p-3 hover:bg-muted" data-testid="parked-user">
                    <span className="font-medium">{p.full_name ?? "—"}</span>
                    <span className="text-sm text-muted-foreground" dir="ltr">{p.phone_masked}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/login" className="text-center text-sm text-accent underline">{t.security.useCode}</Link>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
