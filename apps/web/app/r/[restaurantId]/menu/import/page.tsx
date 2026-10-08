import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@gomenu/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MenuImport } from "@/components/menu-import";
import { requireUser } from "@/lib/auth/context";
import { formatDate } from "@/lib/format";
import { fmt, getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Import menu" };
// Reading a long PDF can take a while; the server action runs within this route.
export const maxDuration = 300;

type Feature = { enabled: boolean };

export default async function ImportPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const ctx = await requireUser();
  if (!ctx.active_memberships?.some((m) => m.restaurant_id === restaurantId)) notFound();
  const { locale, t } = await getDictionary();
  const supabase = await createClient();
  const [{ data: perms }, { data: balance }, { data: jobs }, { data: ent }] = await Promise.all([
    supabase.rpc("my_permissions", { p_restaurant_id: restaurantId }),
    supabase.rpc("ai_credit_balance", { p_restaurant_id: restaurantId }),
    supabase.from("ai_jobs").select("id, kind, status, item_count, credits_charged, created_at, target_locale")
      .eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(10),
    supabase.rpc("restaurant_entitlements", { p_restaurant_id: restaurantId }),
  ]);
  if (!(perms ?? []).includes("menu.edit")) notFound();
  const enabled = ((ent as { features?: Record<string, Feature> } | null)?.features?.ai_menu_import?.enabled) ?? false;

  return (
    <div className="grid gap-6">
      <div>
        <Link href={`/r/${restaurantId}/menu`} className="text-sm text-muted-foreground hover:underline">← {t.menu.back}</Link>
        <h1 className="text-2xl font-semibold">{t.ai.title}</h1>
        <p className="text-muted-foreground" data-testid="ai-balance">{fmt(t.ai.credits, { n: balance ?? 0 })} · {t.ai.creditsHelp}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">{t.ai.importTitle}</CardTitle>
          <CardDescription>{t.ai.importBody}</CardDescription>
        </CardHeader>
        <CardContent>
          {enabled ? (
            <MenuImport restaurantId={restaurantId}
                        labels={{ file: t.ai.file, start: t.ai.start, processing: t.ai.processing, fileInvalid: t.ai.fileInvalid }} />
          ) : (
            <p className="text-sm text-muted-foreground">{t.ai.notIncluded}</p>
          )}
        </CardContent>
      </Card>
      {jobs?.length ? (
        <Card>
          <CardHeader><CardTitle as="h2" className="text-base">{t.ai.jobs}</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y">
              {jobs.map((j) => (
                <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" data-testid="ai-job">
                  <span>
                    {t.ai.kinds[j.kind]}{j.target_locale ? ` · ${j.target_locale}` : ""} · {formatDate(j.created_at, locale)} · {j.item_count}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={j.status === "failed" ? "danger" : j.status === "completed" ? "success" : "warning"}>{t.ai.status[j.status]}</Badge>
                    {j.kind === "menu_import" && ["needs_review", "needs_credits", "failed"].includes(j.status) ? (
                      <Link className="underline" href={`/r/${restaurantId}/menu/import/${j.id}`}>{t.ai.open}</Link>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
