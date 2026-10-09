import { Alert } from "@gomenu/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoLock, LockButton } from "@/components/auto-lock";
import { LanguageSwitch } from "@/components/language-switch";
import { LogoutButton } from "@/components/logout-button";
import { requireUser } from "@/lib/auth/context";
import { daysUntil } from "@/lib/format";
import { fmt, getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export default async function RestaurantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ restaurantId: string }>;
}) {
  const { restaurantId } = await params;
  const ctx = await requireUser();
  // Only memberships the database reports as accessible appear here; others get a 404, and
  // RLS would return no rows anyway.
  const membership = ctx.active_memberships?.find((m) => m.restaurant_id === restaurantId);
  if (!membership) notFound();
  const { locale, t } = await getDictionary();
  const supabase = await createClient();
  const { data: perms } = await supabase.rpc("my_permissions", { p_restaurant_id: restaurantId });
  const can = (p: string) => (perms ?? []).includes(p);

  // Owners see their trial countdown; everyone sees lifecycle warnings.
  let trialEndsAt: string | null = null;
  if (membership.restaurant_status === "trial" && can("billing.manage")) {
    const { data } = await supabase.rpc("restaurant_billing_overview", { p_restaurant_id: restaurantId });
    trialEndsAt = (data as { current_period?: { ends_at: string } } | null)?.current_period?.ends_at ?? null;
  }
  const status = membership.restaurant_status;
  const bannerText =
    status === "trial"
      ? trialEndsAt && daysUntil(trialEndsAt) <= 14 ? fmt(t.banner.trial, { days: daysUntil(trialEndsAt) }) : null
      : status === "active" ? null : t.banner[status as keyof typeof t.banner];
  const tone = ["suspended", "retention", "expiring"].includes(status) ? "danger" : status === "trial" ? "info" : "warning";
  const nav = [
    { href: `/r/${restaurantId}`, label: t.dashboard.overview, show: true },
    { href: `/r/${restaurantId}/menu`, label: t.menu.nav, show: can("menu.view") },
    { href: `/r/${restaurantId}/branches`, label: t.branches.nav, show: true },
    { href: `/r/${restaurantId}/staff`, label: t.dashboard.staff, show: can("staff.view") },
    { href: `/r/${restaurantId}/gallery`, label: t.gallery.nav, show: can("gallery.manage") },
    { href: `/r/${restaurantId}/promotions`, label: t.promotions.nav, show: can("promotions.manage") },
    { href: `/r/${restaurantId}/frames`, label: t.frames.nav, show: can("frames.manage") },
    { href: `/r/${restaurantId}/qr`, label: t.qr.nav, show: can("qr.manage") },
    { href: `/r/${restaurantId}/website`, label: t.website.nav, show: can("website.manage") },
    { href: `/r/${restaurantId}/settings`, label: t.settings.nav, show: can("settings.manage") || can("website.manage") },
    { href: `/r/${restaurantId}/setup`, label: t.setup.setupNav, show: can("settings.manage") },
    { href: `/r/${restaurantId}/billing`, label: t.billing.nav, show: can("billing.manage") },
  ];
  const { data: restaurantRow } = await supabase.from("restaurants").select("staff_auto_lock_minutes").eq("id", restaurantId).single();

  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto grid max-w-5xl gap-2 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 truncate font-semibold">{membership.restaurant_name}</span>
            <div className="flex flex-wrap items-center gap-1">
              <LockButton label={t.security.lock} />
              <Link className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted" href="/account">{t.common.account}</Link>
              <LanguageSwitch locale={locale} label={t.common.switchLanguage} />
              <LogoutButton label={t.common.logout} />
            </div>
          </div>
          {/* Scrolls sideways on phones instead of widening the page. */}
          <nav className="-mx-1 flex min-w-0 gap-1 overflow-x-auto text-sm whitespace-nowrap">
            {nav.filter((n) => n.show).map((n) => (
              <Link key={n.href} className="rounded-md px-2 py-1 hover:bg-muted" href={n.href}>{n.label}</Link>
            ))}
          </nav>
        </div>
      </header>
      {bannerText ? (
        <div className="mx-auto max-w-5xl px-4 pt-4">
          <Alert tone={tone} data-testid="lifecycle-banner" className="flex flex-wrap items-center justify-between gap-2">
            <span>{bannerText}</span>
            {can("billing.manage") ? (
              <Link href={`/r/${restaurantId}/billing`} className="font-medium underline">{t.banner.action}</Link>
            ) : null}
          </Alert>
        </div>
      ) : null}
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      <AutoLock minutes={restaurantRow?.staff_auto_lock_minutes ?? 5} />
    </div>
  );
}
