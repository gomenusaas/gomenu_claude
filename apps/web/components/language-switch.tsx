import { setLocale } from "@/app/actions/locale";
import type { Locale } from "@/lib/i18n";

export function LanguageSwitch({ locale, label }: { locale: Locale; label: string }) {
  return (
    <form action={setLocale}>
      <input type="hidden" name="locale" value={locale === "ar" ? "en" : "ar"} />
      <button type="submit" className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted">
        {label}
      </button>
    </form>
  );
}
