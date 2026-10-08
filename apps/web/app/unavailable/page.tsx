import { Card, CardContent, CardHeader, CardTitle } from "@gomenu/ui";
import { AuthShell } from "@/components/auth-shell";
import { LogoutButton } from "@/components/logout-button";
import { requireUser } from "@/lib/auth/context";
import { fmt, getDictionary } from "@/lib/i18n";

// Staff of a suspended restaurant: they learn only the restaurant name and that it is unavailable.
export default async function UnavailablePage() {
  const ctx = await requireUser();
  const { t } = await getDictionary();
  return (
    <AuthShell>
      <Card>
        <CardHeader><CardTitle>{t.unavailable.title}</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          {(ctx.unavailable_memberships ?? []).map((m) => (
            <p key={m.restaurant_name} className="text-muted-foreground">{fmt(t.unavailable.body, { restaurant: m.restaurant_name })}</p>
          ))}
          <LogoutButton label={t.common.logout} />
        </CardContent>
      </Card>
    </AuthShell>
  );
}
