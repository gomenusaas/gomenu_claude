import "./site.css";
import { fmt } from "@/lib/i18n";
import { siteStrings } from "@/lib/site/strings";

/** spec §6: a suspended restaurant's website is offline. Nothing else about it is shown. */
export function Unavailable({ name, locale }: { name: string; locale: string }) {
  const s = siteStrings(locale);
  return (
    <div className="gm-site grid min-h-dvh place-items-center p-6 text-center" dir={locale === "ar" ? "rtl" : "ltr"} lang={locale}
         data-testid="site-unavailable">
      <div className="grid max-w-md gap-2">
        <h1 className="text-2xl font-semibold">{fmt(s.unavailableTitle, { name })}</h1>
        <p className="opacity-75">{s.unavailableBody}</p>
      </div>
    </div>
  );
}
