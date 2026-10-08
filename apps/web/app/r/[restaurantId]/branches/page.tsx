import { Badge, Card, CardContent, CardHeader, CardTitle, Field, Input, Label } from "@gomenu/ui";
import { notFound } from "next/navigation";
import { addBranch, archiveBranch, saveBranch, saveHours, saveOverride } from "@/app/actions/branches";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth/context";
import { isoToZonedLocal } from "@/lib/format";
import { getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Branches" };

const hhmm = (t: string | null | undefined) => (t ?? "").slice(0, 5);

export default async function BranchesPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const ctx = await requireUser();
  if (!ctx.active_memberships?.some((m) => m.restaurant_id === restaurantId)) notFound();
  const { t } = await getDictionary();
  const supabase = await createClient();
  const [{ data: perms }, { data: branches }, { data: hours }, { data: openState }, { data: r }] = await Promise.all([
    supabase.rpc("my_permissions", { p_restaurant_id: restaurantId }),
    supabase.from("branches").select("*").eq("restaurant_id", restaurantId).is("archived_at", null)
      .order("sort").order("created_at"),
    supabase.from("branch_hours").select("branch_id, day_of_week, opens_at, closes_at").eq("restaurant_id", restaurantId),
    supabase.rpc("branch_open_status", { p_restaurant_id: restaurantId }),
    supabase.from("restaurants").select("timezone").eq("id", restaurantId).single(),
  ]);
  const tz = r?.timezone ?? "UTC";
  const canManage = (perms ?? []).includes("branches.manage");
  const isOpen = (openState ?? {}) as Record<string, boolean>;

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t.branches.title}</h1>

      {(branches ?? []).map((b) => {
        const days = new Map((hours ?? []).filter((h) => h.branch_id === b.id).map((h) => [h.day_of_week, h]));
        const id = (k: string) => `${k}-${b.id}`;
        return (
          <Card key={b.id} data-testid="branch-card">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle as="h2" className="text-base">{b.name}</CardTitle>
              <Badge tone={isOpen[b.id] ? "success" : "neutral"} data-testid="branch-open-state">
                {isOpen[b.id] ? t.branches.open : t.branches.closed}
              </Badge>
            </CardHeader>
            <CardContent className="grid gap-4">
              {!canManage ? (
                <p className="text-sm text-muted-foreground">{b.address}</p>
              ) : (
                <>
                  <details>
                    <summary className="cursor-pointer text-sm font-medium">{t.branches.details}</summary>
                    <ActionForm action={saveBranch} className="mt-3">
                      <input type="hidden" name="restaurant_id" value={restaurantId} />
                      <input type="hidden" name="branch_id" value={b.id} />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field id={id("name")} label={t.branches.name}><Input name="name" defaultValue={b.name} required /></Field>
                        <Field id={id("address")} label={t.branches.address}><Input name="address" defaultValue={b.address ?? ""} /></Field>
                        <Field id={id("phone")} label={t.settings.contactPhone}><Input name="phone" type="tel" dir="ltr" defaultValue={b.phone_e164 ?? ""} /></Field>
                        <Field id={id("whatsapp")} label={t.settings.whatsapp}><Input name="whatsapp" type="tel" dir="ltr" defaultValue={b.whatsapp_e164 ?? ""} /></Field>
                        <Field id={id("maps")} label={t.branches.mapsUrl} className="sm:col-span-2">
                          <Input name="maps_url" type="url" dir="ltr" defaultValue={b.maps_url ?? ""} />
                        </Field>
                        <Field id={id("lat")} label={t.branches.latitude}><Input name="latitude" inputMode="decimal" dir="ltr" defaultValue={b.latitude ?? ""} /></Field>
                        <Field id={id("lng")} label={t.branches.longitude}><Input name="longitude" inputMode="decimal" dir="ltr" defaultValue={b.longitude ?? ""} /></Field>
                      </div>
                      <SubmitButton size="sm">{t.common.save}</SubmitButton>
                    </ActionForm>
                  </details>

                  <details>
                    <summary className="cursor-pointer text-sm font-medium">{t.branches.hours}</summary>
                    <ActionForm action={saveHours} className="mt-3">
                      <input type="hidden" name="restaurant_id" value={restaurantId} />
                      <input type="hidden" name="branch_id" value={b.id} />
                      <div className="grid gap-2">
                        {t.branches.days.map((dayName, day) => {
                          const h = days.get(day);
                          return (
                            <div key={day} className="flex flex-wrap items-center gap-2" data-testid="hours-row">
                              <label className="flex w-36 items-center gap-2 text-sm">
                                <input type="checkbox" name={`open:${day}`} defaultChecked={Boolean(h)} />
                                {dayName}
                              </label>
                              <Input name={`opens:${day}`} type="time" aria-label={`${dayName} ${t.branches.opens}`}
                                     defaultValue={hhmm(h?.opens_at) || "09:00"} className="w-32" />
                              <span aria-hidden>–</span>
                              <Input name={`closes:${day}`} type="time" aria-label={`${dayName} ${t.branches.closes}`}
                                     defaultValue={hhmm(h?.closes_at) || "23:00"} className="w-32" />
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-sm text-muted-foreground">{t.branches.hoursHint}</p>
                      <SubmitButton size="sm">{t.common.save}</SubmitButton>
                    </ActionForm>
                  </details>

                  <details>
                    <summary className="cursor-pointer text-sm font-medium">{t.branches.override}</summary>
                    <ActionForm action={saveOverride} className="mt-3">
                      <input type="hidden" name="restaurant_id" value={restaurantId} />
                      <input type="hidden" name="branch_id" value={b.id} />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="grid gap-2">
                          <Label htmlFor={id("override")}>{t.branches.override}</Label>
                          <select id={id("override")} name="status_override" defaultValue={b.status_override}
                                  className="h-11 rounded-md border border-input bg-background px-3">
                            <option value="auto">{t.branches.overrideAuto}</option>
                            <option value="open">{t.branches.overrideOpen}</option>
                            <option value="closed">{t.branches.overrideClosed}</option>
                          </select>
                        </div>
                        <Field id={id("until")} label={t.branches.overrideUntil}>
                          <Input name="override_until" type="datetime-local"
                                 defaultValue={b.override_until ? isoToZonedLocal(b.override_until, tz) : ""} />
                        </Field>
                      </div>
                      <SubmitButton size="sm">{t.common.save}</SubmitButton>
                    </ActionForm>
                  </details>

                  {(branches ?? []).length > 1 ? (
                    <ActionForm action={archiveBranch}>
                      <input type="hidden" name="restaurant_id" value={restaurantId} />
                      <input type="hidden" name="branch_id" value={b.id} />
                      <div><SubmitButton size="sm" variant="ghost">{t.branches.archive}</SubmitButton></div>
                    </ActionForm>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        );
      })}

      {canManage ? (
        <Card>
          <CardHeader><CardTitle as="h2" className="text-base">{t.branches.addTitle}</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={addBranch}>
              <input type="hidden" name="restaurant_id" value={restaurantId} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="new-name" label={t.branches.name}><Input name="name" required /></Field>
                <Field id="new-address" label={t.branches.address}><Input name="address" /></Field>
                <Field id="new-phone" label={t.settings.contactPhone}><Input name="phone" type="tel" dir="ltr" /></Field>
                <Field id="new-whatsapp" label={t.settings.whatsapp}><Input name="whatsapp" type="tel" dir="ltr" /></Field>
              </div>
              <SubmitButton>{t.branches.add}</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
