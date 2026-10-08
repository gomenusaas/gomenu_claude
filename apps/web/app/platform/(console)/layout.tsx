import { Badge } from "@gomenu/ui";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { getMyContext } from "@/lib/auth/context";

export const metadata = { robots: { index: false } };

const NAV = [
  { href: "/platform", label: "Overview", roles: null },
  { href: "/platform/restaurants", label: "Restaurants", roles: ["super_admin", "admin", "finance", "support"] },
  { href: "/platform/invoices", label: "Invoices", roles: ["super_admin", "admin", "finance"] },
  { href: "/platform/plans", label: "Plans & prices", roles: ["super_admin", "admin"] },
  { href: "/platform/languages", label: "Languages", roles: ["super_admin", "admin", "content"] },
  { href: "/platform/settings", label: "Settings", roles: ["super_admin"] },
  { href: "/platform/staff", label: "Staff", roles: ["super_admin"] },
  { href: "/platform/audit", label: "Audit log", roles: ["super_admin"] },
];

// The database is the authority (every RPC checks role + MFA); this only routes and hides.
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getMyContext();
  if (!ctx.authenticated) redirect("/platform/login");
  if (!ctx.platform_role) notFound();
  if (ctx.aal !== "aal2") redirect("/platform/mfa");
  return (
    <div className="min-h-dvh" dir="ltr" lang="en">
      <header className="border-b bg-muted/40">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold">GoMenu platform</span>
            <nav className="flex flex-wrap gap-1 text-sm">
              {NAV.filter((n) => !n.roles || n.roles.includes(ctx.platform_role!)).map((n) => (
                <Link key={n.href} href={n.href} className="rounded-md px-2 py-1 hover:bg-muted">{n.label}</Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="accent">{ctx.platform_role}</Badge>
            <LogoutButton label="Log out" />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
