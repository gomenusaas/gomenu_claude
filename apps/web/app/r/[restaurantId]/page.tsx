import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@gomenu/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/context";
import { fmt, getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

type Dashboard = {
  branches: { id: string; name: string; is_open: boolean }[];
  menu?: { categories: number; items: number; unavailable: number; untranslated_ai: number };
  staff?: Record<string, number>;
  ai_credits?: number;
  website?: { published: boolean; slug: string; domains_active: number } | null;
};

function Stat({ label, value, href, testId }: { label: string; value: React.ReactNode; href?: string; testId?: string }) {
  const body = (
    <Card className="h-full">
      <CardContent className="grid gap-1 pt-6">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-2xl font-semibold" data-testid={testId}>{value}</span>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href} className="rounded-lg focus-visible:outline-2">{body}</Link> : body;
}

export default async function RestaurantOverview({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const ctx = await requireUser();
  // Pages render concurrently with layouts, so each page re-checks membership itself.
  const membership = ctx.active_memberships?.find((m) => m.restaurant_id === restaurantId);
  if (!membership) notFound();
  const { t } = await getDictionary();
  const supabase = await createClient();
  // The RPC includes only the sections this person's permissions allow, and only branches in scope.
  const { data } = await supabase.rpc("restaurant_dashboard", { p_restaurant_id: restaurantId });
  const d = (data ?? { branches: [] }) as Dashboard;
  const base = `/r/${restaurantId}`;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{fmt(t.dashboard.welcome, { name: ctx.full_name ?? "" })}</h1>
        <p className="text-muted-foreground">{fmt(t.dashboard.role, { role: membership.role_name })}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {d.menu ? (
          <>
            <Stat label={t.dashboard.menuItems} value={d.menu.items} href={`${base}/menu`} testId="stat-items" />
            <Stat label={t.dashboard.categories} value={d.menu.categories} href={`${base}/menu`} />
            <Stat label={t.dashboard.soldOut} value={d.menu.unavailable} href={`${base}/menu`} />
            <Stat label={t.dashboard.aiDrafts} value={d.menu.untranslated_ai} href={`${base}/menu/translations`} />
          </>
        ) : null}
        {d.staff ? (
          <>
            <Stat label={t.dashboard.staffActive} value={d.staff.active ?? 0} href={`${base}/staff`} />
            <Stat label={t.dashboard.staffPending} value={d.staff.new_staff ?? 0} href={`${base}/staff`} />
          </>
        ) : null}
        {d.ai_credits !== undefined ? <Stat label={t.dashboard.aiCredits} value={d.ai_credits} testId="stat-credits" /> : null}
        {d.website ? (
          <Stat label={t.dashboard.website} href={`${base}/website`}
                value={<span className="text-base">{d.website.published ? t.dashboard.websitePublished : t.dashboard.websiteHidden}</span>} />
        ) : null}
      </div>

      <Card>
        <CardHeader><CardTitle as="h2" className="text-base">{t.dashboard.branches}</CardTitle></CardHeader>
        <CardContent>
          <ul className="grid gap-2">
            {d.branches.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2" data-testid="dashboard-branch">
                <span>{b.name}</span>
                <Badge tone={b.is_open ? "success" : "neutral"}>{b.is_open ? t.branches.open : t.branches.closed}</Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardContent><CardDescription>{t.dashboard.phaseNote}</CardDescription></CardContent>
      </Card>
    </div>
  );
}
