import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from "@gomenu/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelJob, publishImport, unlockJob } from "@/app/actions/ai";
import { ActionForm } from "@/components/action-form";
import { RowAction } from "@/components/row-action";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth/context";
import { minorToInput } from "@/lib/format";
import { fmt, getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Review import" };

type ImportResult = { categories: { name: string; items: { name: string; description: string | null; price_minor: number }[] }[] };

export default async function ImportJobPage({ params }: { params: Promise<{ restaurantId: string; jobId: string }> }) {
  const { restaurantId, jobId } = await params;
  const ctx = await requireUser();
  if (!ctx.active_memberships?.some((m) => m.restaurant_id === restaurantId)) notFound();
  const { t } = await getDictionary();
  const supabase = await createClient();
  const [{ data: perms }, { data: job }, { data: r }] = await Promise.all([
    supabase.rpc("my_permissions", { p_restaurant_id: restaurantId }),
    supabase.from("ai_jobs").select("*").eq("id", jobId).eq("restaurant_id", restaurantId).eq("kind", "menu_import").maybeSingle(),
    supabase.from("restaurants").select("currency").eq("id", restaurantId).single(),
  ]);
  if (!job || !r || !(perms ?? []).includes("menu.edit")) notFound();
  const result = (job.result ?? { categories: [] }) as ImportResult;
  const jobFields = { restaurant_id: restaurantId, job_id: job.id };

  return (
    <div className="grid gap-6">
      <div>
        <Link href={`/r/${restaurantId}/menu/import`} className="text-sm text-muted-foreground hover:underline">← {t.ai.title}</Link>
        <h1 className="text-2xl font-semibold">{t.ai.review}</h1>
        <p className="text-muted-foreground" data-testid="job-status">{t.ai.status[job.status]}</p>
      </div>

      {job.status === "failed" ? <Alert tone="danger">{fmt(t.ai.failed, { error: job.error ?? "" })}</Alert> : null}

      {job.status === "needs_credits" ? (
        <Card>
          <CardContent className="grid gap-3 pt-6">
            <p>{fmt(t.ai.needsCredits, { n: job.item_count })}</p>
            <div className="flex flex-wrap gap-2">
              <RowAction action={unlockJob} fields={jobFields} label={t.ai.unlock} variant="primary" />
              {(perms ?? []).includes("billing.manage") ? (
                <Button asChild variant="outline" size="sm"><Link href={`/r/${restaurantId}/billing#ai-credits`}>{t.ai.buyCredits}</Link></Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {job.status === "needs_review" ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-base">{fmt(t.ai.itemsFound, { n: job.item_count, credits: job.credits_charged })}</CardTitle>
            <CardDescription>{t.ai.reviewBody}</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={publishImport}>
              <input type="hidden" name="restaurant_id" value={restaurantId} />
              <input type="hidden" name="job_id" value={job.id} />
              {result.categories.map((c, ci) => (
                <fieldset key={ci} className="grid gap-2 rounded-md border p-3" data-testid="import-category">
                  <Input name={`cat:${ci}:name`} defaultValue={c.name} aria-label={t.menu.category} className="font-semibold" />
                  {c.items.map((item, ii) => (
                    <div key={ii} className="grid gap-2 sm:grid-cols-[auto_2fr_3fr_1fr] sm:items-center" data-testid="import-item">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name={`item:${ci}:${ii}:include`} defaultChecked />
                        <span className="sm:sr-only">{t.ai.include}</span>
                      </label>
                      <Input name={`item:${ci}:${ii}:name`} defaultValue={item.name} aria-label={fmt(t.menu.itemName, { lang: "" })} />
                      <Input name={`item:${ci}:${ii}:description`} defaultValue={item.description ?? ""} aria-label={fmt(t.menu.itemDescription, { lang: "" })} />
                      <Input name={`item:${ci}:${ii}:price`} defaultValue={minorToInput(item.price_minor, r.currency)} inputMode="decimal" dir="ltr"
                             aria-label={fmt(t.menu.price, { currency: r.currency })} />
                    </div>
                  ))}
                </fieldset>
              ))}
              <div className="flex flex-wrap gap-2">
                <SubmitButton data-testid="import-publish">{t.ai.publish}</SubmitButton>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}

      {["needs_review", "needs_credits", "failed"].includes(job.status) ? (
        <div><RowAction action={cancelJob} fields={jobFields} label={t.ai.cancel} variant="outline" /></div>
      ) : null}
    </div>
  );
}
