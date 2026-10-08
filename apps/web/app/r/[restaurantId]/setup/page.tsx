import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Label } from "@gomenu/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { finishSetup, saveBranch, saveDetails } from "@/app/actions/setup";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth/context";
import { getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Setup" };

type Steps = { details: boolean; branch: boolean; team: boolean; plan: boolean; completed_at: string | null };

export default async function SetupPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const ctx = await requireUser();
  const membership = ctx.active_memberships?.find((m) => m.restaurant_id === restaurantId);
  if (!membership) notFound();
  const { t } = await getDictionary();
  const supabase = await createClient();
  const [{ data: stepsData }, { data: restaurant }, { data: branches }] = await Promise.all([
    supabase.rpc("restaurant_setup_status", { p_restaurant_id: restaurantId }),
    supabase.from("restaurants").select("name, default_locale").eq("id", restaurantId).single(),
    supabase.from("branches").select("id, name, address, phone_e164").eq("restaurant_id", restaurantId).order("created_at").limit(1),
  ]);
  const steps = stepsData as Steps | null;
  if (!steps) notFound(); // requires settings.manage
  const branch = branches?.[0];
  const step = (done: boolean) => <Badge tone={done ? "success" : "warning"}>{done ? t.setup.done : t.setup.todo}</Badge>;
  const disabled = !membership.writable;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.setup.title}</h1>
        <p className="text-muted-foreground">{t.setup.body}</p>
      </div>

      <Card data-testid="setup-details">
        <CardHeader>
          <div className="flex items-center justify-between"><CardTitle as="h2" className="text-base">1. {t.setup.details}</CardTitle>{step(steps.details)}</div>
          <CardDescription>{t.setup.detailsBody}</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveDetails}>
            <input type="hidden" name="restaurant_id" value={restaurantId} />
            <Field id="name" label={t.onboarding.restaurantName}><Input name="name" defaultValue={restaurant?.name ?? ""} required disabled={disabled} /></Field>
            <div className="grid gap-2">
              <Label htmlFor="default_locale">{t.setup.defaultLocale}</Label>
              <select id="default_locale" name="default_locale" defaultValue={restaurant?.default_locale ?? "en"} disabled={disabled}
                      className="h-11 rounded-md border border-input bg-background px-3">
                <option value="en">{t.setup.english}</option>
                <option value="ar">{t.setup.arabic}</option>
              </select>
            </div>
            <SubmitButton disabled={disabled}>{t.common.save}</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      {branch ? (
        <Card data-testid="setup-branch">
          <CardHeader>
            <div className="flex items-center justify-between"><CardTitle as="h2" className="text-base">2. {t.setup.branch}</CardTitle>{step(steps.branch)}</div>
            <CardDescription>{t.setup.branchBody}</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={saveBranch}>
              <input type="hidden" name="restaurant_id" value={restaurantId} />
              <input type="hidden" name="branch_id" value={branch.id} />
              <Field id="branch_name" label={t.setup.branchName}><Input name="name" defaultValue={branch.name} required disabled={disabled} /></Field>
              <Field id="address" label={t.setup.address}><Input name="address" defaultValue={branch.address ?? ""} required disabled={disabled} /></Field>
              <Field id="branch_phone" label={t.setup.phone} hint={t.login.mobileHint}>
                <Input name="phone" type="tel" dir="ltr" defaultValue={branch.phone_e164 ?? ""} required disabled={disabled} />
              </Field>
              <SubmitButton disabled={disabled}>{t.common.save}</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between"><CardTitle as="h2" className="text-base">3. {t.setup.team}</CardTitle>{step(steps.team)}</div>
          <CardDescription>{t.setup.teamBody}</CardDescription>
        </CardHeader>
        <CardContent><Button asChild variant="outline"><Link href={`/r/${restaurantId}/staff`}>{t.setup.openStaff}</Link></Button></CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between"><CardTitle as="h2" className="text-base">4. {t.setup.plan}</CardTitle>{step(steps.plan)}</div>
          <CardDescription>{t.setup.planBody}</CardDescription>
        </CardHeader>
        <CardContent><Button asChild variant="outline"><Link href={`/r/${restaurantId}/billing`}>{t.setup.openBilling}</Link></Button></CardContent>
      </Card>

      <form action={finishSetup}>
        <input type="hidden" name="restaurant_id" value={restaurantId} />
        <Button type="submit" variant="secondary">{t.setup.finish}</Button>
      </form>
    </div>
  );
}
