import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@gomenu/ui";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/context";
import { fmt, getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export default async function RestaurantOverview({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const ctx = await requireUser();
  // Pages render concurrently with layouts, so each page re-checks membership itself.
  const membership = ctx.active_memberships?.find((m) => m.restaurant_id === restaurantId);
  if (!membership) notFound();
  const { t } = await getDictionary();
  const supabase = await createClient();
  // RLS returns only the branches in this person's scope.
  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, is_active")
    .eq("restaurant_id", restaurantId)
    .order("created_at");

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{fmt(t.dashboard.welcome, { name: ctx.full_name ?? "" })}</h1>
        <p className="text-muted-foreground">{fmt(t.dashboard.role, { role: membership.role_name })}</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">{t.dashboard.branches}</CardTitle></CardHeader>
        <CardContent>
          <ul className="grid gap-2">
            {(branches ?? []).map((b) => <li key={b.id}>{b.name}</li>)}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardContent><CardDescription>{t.dashboard.phaseNote}</CardDescription></CardContent>
      </Card>
    </div>
  );
}
