import { Card, CardContent, Input } from "@gomenu/ui";
import { setSetting } from "@/app/actions/platform";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { requirePlatformRole } from "@/lib/auth/platform";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Settings" };

export default async function PlatformSettings() {
  await requirePlatformRole(["super_admin"]);
  const supabase = await createClient();
  const { data } = await supabase.from("platform_settings").select("key, value, description").order("key");
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      {(data ?? []).map((row) => {
        const isNumber = typeof row.value === "number";
        return (
          <Card key={row.key}><CardContent>
            <ActionForm action={setSetting} className="md:grid-cols-[1fr_16rem_auto] md:items-end">
              <input type="hidden" name="key" value={row.key} />
              <input type="hidden" name="type" value={isNumber ? "number" : "string"} />
              <div><div className="font-mono text-sm">{row.key}</div><div className="text-sm text-muted-foreground">{row.description}</div></div>
              <Input name="value" aria-label={row.key} type={isNumber ? "number" : "text"} defaultValue={String(row.value ?? "")} />
              <SubmitButton size="sm">Save</SubmitButton>
            </ActionForm>
          </CardContent></Card>
        );
      })}
    </div>
  );
}
