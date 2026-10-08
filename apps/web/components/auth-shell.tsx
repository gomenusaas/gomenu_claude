import Link from "next/link";
import { getDictionary } from "@/lib/i18n";
import { LanguageSwitch } from "./language-switch";

/** Centered single-card layout for login, registration, invitations and pending screens. */
export async function AuthShell({ children }: { children: React.ReactNode }) {
  const { locale, t } = await getDictionary();
  return (
    <div className="min-h-dvh bg-muted/40">
      <header className="mx-auto flex max-w-md items-center justify-between px-4 py-4">
        <Link href="/" className="text-lg font-semibold">{t.common.appName}</Link>
        <LanguageSwitch locale={locale} label={t.common.switchLanguage} />
      </header>
      <main className="mx-auto max-w-md px-4 pb-16">{children}</main>
    </div>
  );
}
