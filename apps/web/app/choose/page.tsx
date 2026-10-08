import { Card, CardContent, CardHeader, CardTitle } from "@gomenu/ui";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { requireUser } from "@/lib/auth/context";
import { getDictionary } from "@/lib/i18n";

export default async function ChooseRestaurant() {
  const ctx = await requireUser();
  const { t } = await getDictionary();
  return (
    <AuthShell>
      <Card>
        <CardHeader><CardTitle>{t.choose.title}</CardTitle></CardHeader>
        <CardContent className="grid gap-2">
          {(ctx.active_memberships ?? []).map((m) => (
            <Link key={m.membership_id} href={`/r/${m.restaurant_id}`} className="rounded-md border p-3 hover:bg-muted">
              <div className="font-medium">{m.restaurant_name}</div>
              <div className="text-sm text-muted-foreground">{m.role_name}</div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
