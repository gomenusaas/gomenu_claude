import { Button } from "@gomenu/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { getMyContext, pathFor } from "@/lib/auth/context";
import { getDictionary } from "@/lib/i18n";

export default async function Home() {
  const ctx = await getMyContext();
  if (ctx.authenticated) redirect(pathFor(ctx));
  const { t } = await getDictionary();
  return (
    <AuthShell>
      <section className="grid gap-6 pt-12 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{t.landing.title}</h1>
        <p className="text-muted-foreground">{t.landing.subtitle}</p>
        <div className="grid gap-3">
          <Button asChild size="lg" block><Link href="/register">{t.landing.register}</Link></Button>
          <Button asChild size="lg" variant="outline" block><Link href="/login">{t.landing.login}</Link></Button>
        </div>
      </section>
    </AuthShell>
  );
}
