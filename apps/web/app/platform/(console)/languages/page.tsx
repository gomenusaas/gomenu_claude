import { Badge, Card, CardContent } from "@gomenu/ui";
import { setLanguage } from "@/app/actions/platform";
import { RowAction } from "@/components/row-action";
import { requirePlatformRole } from "@/lib/auth/platform";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Languages" };

/** Spec §8: the platform enables languages; each restaurant then activates the ones it wants. */
export default async function PlatformLanguages() {
  await requirePlatformRole(["super_admin", "admin", "content"]);
  const supabase = await createClient();
  const { data } = await supabase.from("platform_languages").select("*").order("sort");
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Languages</h1>
      <Card><CardContent className="pt-6">
        <ul className="divide-y">
          {(data ?? []).map((l) => (
            <li key={l.code} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid="platform-language">
              <span>{l.name} · <span dir={l.dir}>{l.native_name}</span> <span className="font-mono text-sm text-muted-foreground">{l.code}</span></span>
              <span className="flex items-center gap-2">
                <Badge tone={l.is_enabled ? "success" : "neutral"}>{l.is_enabled ? "Enabled" : "Disabled"}</Badge>
                {l.code !== "en" && l.code !== "ar" ? (
                  <RowAction action={setLanguage} fields={{ code: l.code, enabled: String(!l.is_enabled) }}
                             label={l.is_enabled ? "Disable" : "Enable"} variant="outline" />
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </CardContent></Card>
    </div>
  );
}
