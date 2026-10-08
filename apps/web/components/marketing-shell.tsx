import { Button } from "@gomenu/ui";
import Link from "next/link";
import { getMyContext } from "@/lib/auth/context";
import { getDictionary } from "@/lib/i18n";
import { LanguageSwitch } from "./language-switch";

export async function MarketingShell({ children }: { children: React.ReactNode }) {
  const { locale, t } = await getDictionary();
  const ctx = await getMyContext();
  const m = t.marketing;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="text-lg font-semibold">{t.common.appName}</Link>
          <nav className="hidden gap-1 text-sm sm:flex">
            <Link className="rounded-md px-3 py-2 hover:bg-muted" href="/features">{m.nav.features}</Link>
            <Link className="rounded-md px-3 py-2 hover:bg-muted" href="/pricing">{m.nav.pricing}</Link>
            <Link className="rounded-md px-3 py-2 hover:bg-muted" href="/contact">{m.nav.contact}</Link>
          </nav>
          <div className="flex items-center gap-1">
            <LanguageSwitch locale={locale} label={t.common.switchLanguage} />
            {ctx.authenticated ? (
              <Button asChild size="sm"><Link href="/app">{m.dashboard}</Link></Button>
            ) : (
              <>
                <Link className="hidden rounded-md px-3 py-2 text-sm hover:bg-muted sm:inline" href="/login">{m.nav.login}</Link>
                <Button asChild size="sm"><Link href="/register">{m.nav.start}</Link></Button>
              </>
            )}
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-4 pb-2 text-sm sm:hidden">
          <Link className="rounded-md px-2 py-1 hover:bg-muted" href="/features">{m.nav.features}</Link>
          <Link className="rounded-md px-2 py-1 hover:bg-muted" href="/pricing">{m.nav.pricing}</Link>
          <Link className="rounded-md px-2 py-1 hover:bg-muted" href="/contact">{m.nav.contact}</Link>
          {ctx.authenticated ? null : <Link className="rounded-md px-2 py-1 hover:bg-muted" href="/login">{m.nav.login}</Link>}
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground">
          <span>{m.footer}</span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:underline">{m.termsTitle}</Link>
            <Link href="/privacy" className="hover:underline">{m.privacyTitle}</Link>
            <Link href="/contact" className="hover:underline">{m.nav.contact}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
