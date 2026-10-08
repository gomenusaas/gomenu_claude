import Link from "next/link";
import { notFound } from "next/navigation";
import { LanguageSwitch } from "@/components/language-switch";
import { LogoutButton } from "@/components/logout-button";
import { requireUser } from "@/lib/auth/context";
import { getDictionary } from "@/lib/i18n";

export default async function RestaurantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ restaurantId: string }>;
}) {
  const { restaurantId } = await params;
  const ctx = await requireUser();
  // Only ACTIVE memberships appear here; New Staff and outsiders get a 404, and RLS would
  // return no rows anyway.
  const membership = ctx.active_memberships?.find((m) => m.restaurant_id === restaurantId);
  if (!membership) notFound();
  const { locale, t } = await getDictionary();

  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-4">
            <span className="font-semibold">{membership.restaurant_name}</span>
            <nav className="flex gap-1 text-sm">
              <Link className="rounded-md px-2 py-1 hover:bg-muted" href={`/r/${restaurantId}`}>{t.dashboard.overview}</Link>
              <Link className="rounded-md px-2 py-1 hover:bg-muted" href={`/r/${restaurantId}/staff`}>{t.dashboard.staff}</Link>
            </nav>
          </div>
          <div className="flex items-center gap-1">
            <Link className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted" href="/account">{t.common.account}</Link>
            <LanguageSwitch locale={locale} label={t.common.switchLanguage} />
            <LogoutButton label={t.common.logout} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
