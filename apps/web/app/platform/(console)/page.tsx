import { Card, CardContent, CardHeader, CardTitle } from "@gomenu/ui";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Platform" };

export default async function PlatformOverview() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("platform_overview");
  const o = (data ?? {}) as { restaurants_by_status?: Record<string, number>; open_invoices?: number; overdue_invoices?: number };
  const statuses = ["trial", "active", "past_due", "grace", "suspended", "retention", "expiring", "deleted"];
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <div className="grid gap-3 sm:grid-cols-4">
        {statuses.map((s) => (
          <Card key={s}><CardContent><div className="text-sm text-muted-foreground">{s}</div><div className="text-2xl font-semibold" data-testid={`count-${s}`}>{o.restaurants_by_status?.[s] ?? 0}</div></CardContent></Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle as="h2" className="text-base">Invoices</CardTitle></CardHeader>
        <CardContent className="text-sm">Open: {o.open_invoices ?? 0} · Overdue: {o.overdue_invoices ?? 0}</CardContent>
      </Card>
    </div>
  );
}
