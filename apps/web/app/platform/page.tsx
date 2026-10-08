import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@gomenu/ui";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { LogoutButton } from "@/components/logout-button";
import { requireUser } from "@/lib/auth/context";
import { getDictionary } from "@/lib/i18n";

export default async function PlatformHome() {
  const ctx = await requireUser();
  if (!ctx.platform_role) redirect("/app");
  const { t } = await getDictionary();
  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>{t.platform.title}</CardTitle>
          <CardDescription>{t.platform.body}</CardDescription>
        </CardHeader>
        <CardContent><LogoutButton label={t.common.logout} /></CardContent>
      </Card>
    </AuthShell>
  );
}
