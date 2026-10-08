import { Badge, Button, Input } from "@gomenu/ui";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import { requirePlatformRole } from "@/lib/auth/platform";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Restaurants" };

type Row = { id: string; name: string; slug: string; status: string; plan_key: string | null; period_kind: string | null;
             period_ends_at: string | null; open_invoices: number; platform_hold: boolean; created_at: string };

// Each listing is written to the platform audit log by the RPC.
export default async function PlatformRestaurants({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requirePlatformRole(["super_admin", "admin", "finance", "support"]);
  const { q, status } = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_list_restaurants", {
    p_search: q || undefined,
    p_status: (status || undefined) as never,
  });
  if (error) return <p className="text-destructive">{error.message}</p>;
  const rows = (data ?? []) as unknown as Row[];
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Restaurants</h1>
      <form className="flex flex-wrap gap-2">
        <Input name="q" defaultValue={q} placeholder="Search name or slug" className="max-w-xs" />
        <select name="status" defaultValue={status ?? ""} className="h-11 rounded-md border border-input bg-background px-3">
          <option value="">All statuses</option>
          {["trial", "active", "past_due", "grace", "suspended", "retention", "expiring", "deleted"].map((s) => <option key={s}>{s}</option>)}
        </select>
        <Button type="submit" variant="outline">Filter</Button>
      </form>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-start"><tr>
            {["Restaurant", "Status", "Plan", "Coverage ends", "Open invoices", "Created"].map((h) => <th key={h} className="p-2 text-start font-medium">{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t" data-testid="platform-restaurant-row">
                <td className="p-2"><Link className="text-accent underline" href={`/platform/restaurants/${r.id}`}>{r.name}</Link><div className="text-muted-foreground">{r.slug}</div></td>
                <td className="p-2"><Badge tone={["trial", "active"].includes(r.status) ? "success" : "warning"}>{r.status}</Badge>{r.platform_hold ? <Badge tone="danger" className="ms-1">hold</Badge> : null}</td>
                <td className="p-2">{r.plan_key ?? "—"}</td>
                <td className="p-2">{r.period_ends_at ? `${formatDate(r.period_ends_at, "en")} (${r.period_kind})` : "—"}</td>
                <td className="p-2">{r.open_invoices}</td>
                <td className="p-2">{formatDate(r.created_at, "en")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
