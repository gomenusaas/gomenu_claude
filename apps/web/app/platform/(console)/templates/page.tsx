import { Badge, Card, CardContent, CardHeader, CardTitle, Field, Input, Label } from "@gomenu/ui";
import { upsertTemplate } from "@/app/actions/platform";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { requirePlatformRole } from "@/lib/auth/platform";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Templates" };

type Template = { key: string; name: Record<string, string>; description: Record<string, string>; tier: "free" | "gold" | "paid";
  price_minor: number | null; currency: string; is_active: boolean; sort: number };

const LAYOUTS = ["classic", "minimal", "cards", "showcase", "bold", "street", "elegant", "magazine", "cafe"];

function TemplateForm({ t }: { t?: Template }) {
  const id = t?.key ?? "new";
  return (
    <ActionForm action={upsertTemplate}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id={`key-${id}`} label="Key (matches a layout in the app)">
          <Input name="key" defaultValue={t?.key ?? ""} readOnly={Boolean(t)} required />
        </Field>
        <Field id={`name_en-${id}`} label="Name (English)"><Input name="name_en" defaultValue={t?.name.en ?? ""} required /></Field>
        <Field id={`name_ar-${id}`} label="Name (Arabic)"><Input name="name_ar" dir="rtl" defaultValue={t?.name.ar ?? ""} /></Field>
        <Field id={`description_en-${id}`} label="Description (English)" className="sm:col-span-3">
          <Input name="description_en" defaultValue={t?.description.en ?? ""} />
        </Field>
        <Field id={`description_ar-${id}`} label="Description (Arabic)" className="sm:col-span-3">
          <Input name="description_ar" dir="rtl" defaultValue={t?.description.ar ?? ""} />
        </Field>
        <div className="grid gap-2">
          <Label htmlFor={`tier-${id}`}>Tier</Label>
          <select id={`tier-${id}`} name="tier" defaultValue={t?.tier ?? "free"} className="h-11 rounded-md border border-input bg-background px-3">
            <option value="free">Free</option><option value="gold">Gold</option><option value="paid">Paid (one-time)</option>
          </select>
        </div>
        <Field id={`price-${id}`} label="Price, USD (paid only)">
          <Input name="price" inputMode="decimal" defaultValue={t?.price_minor != null ? (t.price_minor / 100).toFixed(2) : ""} />
        </Field>
        <Field id={`sort-${id}`} label="Order"><Input name="sort" type="number" defaultValue={t?.sort ?? 100} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={t?.is_active ?? true} /> Active</label>
      <div><SubmitButton size="sm">{t ? "Save" : "Add template"}</SubmitButton></div>
    </ActionForm>
  );
}

/** spec §7: templates are records Platform manages (add, price, activate, preview). */
export default async function PlatformTemplates() {
  await requirePlatformRole(["super_admin", "admin", "content"]);
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_templates", { p_include_inactive: true });
  const templates = (data ?? []) as unknown as Template[];
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Templates</h1>
      <p className="text-sm text-muted-foreground">
        Each key renders a layout built into the app ({LAYOUTS.join(", ")}). A new key without a layout shows the Classic layout
        until one is added. Restaurants preview any active template with their own content.
      </p>
      {templates.map((t) => (
        <Card key={t.key} data-testid="platform-template">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle as="h2" className="text-base">{t.name.en} <span className="font-mono text-sm text-muted-foreground">{t.key}</span></CardTitle>
            <span className="flex gap-2">
              <Badge>{t.tier}{t.price_minor != null ? ` · ${formatMoney(t.price_minor, t.currency, "en")}` : ""}</Badge>
              <Badge tone={t.is_active ? "success" : "neutral"}>{t.is_active ? "Active" : "Inactive"}</Badge>
              {!LAYOUTS.includes(t.key) ? <Badge tone="warning">No layout yet</Badge> : null}
            </span>
          </CardHeader>
          <CardContent><details><summary className="cursor-pointer text-sm">Edit</summary><div className="mt-3"><TemplateForm t={t} /></div></details></CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader><CardTitle as="h2" className="text-base">Add a template</CardTitle></CardHeader>
        <CardContent><TemplateForm /></CardContent>
      </Card>
    </div>
  );
}
