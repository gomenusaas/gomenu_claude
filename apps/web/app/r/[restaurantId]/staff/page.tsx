import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Label } from "@gomenu/ui";
import { assignRole, cancelInvitation, inviteStaff, resendInvitation } from "@/app/actions/staff";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import type { MembershipStatus } from "@/lib/auth/context";
import { getDictionary } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Staff" };

const tone = (s: MembershipStatus) =>
  s === "active" ? "success" : s === "new_staff" ? "accent" : ["expired", "cancelled", "removed", "disabled", "locked"].includes(s) ? "danger" : "warning";

export default async function StaffPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const { t } = await getDictionary();
  const supabase = await createClient();

  // Permissions decide which controls to SHOW. The RPCs re-check everything server-side.
  const { data: perms } = await supabase.rpc("my_permissions", { p_restaurant_id: restaurantId });
  const can = (p: string) => (perms ?? []).includes(p);
  if (!can("staff.view")) {
    return <Alert tone="warning">{t.staff.noPermission}</Alert>;
  }

  const [{ data: members }, { data: branches }, { data: roles }, { data: notifications }] = await Promise.all([
    supabase
      .from("memberships")
      .select("id, status, user_id, invited_name, invited_phone_e164, branch_scope, created_at, role:roles(id, key, name, is_owner)")
      .eq("restaurant_id", restaurantId)
      .not("status", "in", "(cancelled,removed)")
      .order("created_at"),
    supabase.from("branches").select("id, name").eq("restaurant_id", restaurantId).order("created_at"),
    supabase.from("roles").select("id, key, name, is_owner, is_new_staff, restaurant_id").is("archived_at", null).order("name"),
    supabase
      .from("restaurant_notifications")
      .select("id, title, data, created_at")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const userIds = (members ?? []).map((m) => m.user_id).filter(Boolean) as string[];
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, full_name, phone_e164").in("id", userIds)
    : { data: [] };
  const profileOf = (id: string | null) => profiles?.find((p) => p.id === id);
  const assignableRoles = (roles ?? []).filter((r) => !r.is_new_staff && (!r.is_owner || can("ownership.transfer")));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section className="grid gap-4">
        <h1 className="text-2xl font-semibold">{t.staff.title}</h1>
        <Card>
          <CardHeader><CardTitle className="text-base">{t.staff.team}</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            {(members ?? []).length === 0 ? <p className="text-muted-foreground">{t.staff.empty}</p> : null}
            {(members ?? []).map((m) => {
              const profile = profileOf(m.user_id);
              const status = m.status as MembershipStatus;
              return (
                <div key={m.id} className="grid gap-3 rounded-md border p-3" data-testid="staff-row">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{profile?.full_name ?? m.invited_name}</div>
                      <div className="text-sm text-muted-foreground" dir="ltr">{profile?.phone_e164 ?? m.invited_phone_e164}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {m.role && !m.role.is_owner && status === "active" ? <Badge>{m.role.name}</Badge> : null}
                      {m.role?.is_owner ? <Badge>{m.role.name}</Badge> : null}
                      <Badge tone={tone(status)}>{t.status[status]}</Badge>
                    </div>
                  </div>

                  {can("staff.manage") && ["invitation_sent", "verification_pending", "expired"].includes(status) && !m.user_id ? (
                    <div className="flex gap-2">
                      <form action={resendInvitation}>
                        <input type="hidden" name="membership_id" value={m.id} />
                        <input type="hidden" name="restaurant_id" value={restaurantId} />
                        <Button size="sm" variant="outline" type="submit">{t.staff.resend}</Button>
                      </form>
                      <form action={cancelInvitation}>
                        <input type="hidden" name="membership_id" value={m.id} />
                        <input type="hidden" name="restaurant_id" value={restaurantId} />
                        <Button size="sm" variant="ghost" type="submit">{t.staff.cancelInvite}</Button>
                      </form>
                    </div>
                  ) : null}

                  {can("roles.assign") && status === "new_staff" ? (
                    <ActionForm action={assignRole} className="rounded-md bg-muted/50 p-3">
                      <input type="hidden" name="membership_id" value={m.id} />
                      <input type="hidden" name="restaurant_id" value={restaurantId} />
                      <div className="text-sm font-medium">{t.staff.assignTitle}</div>
                      <div className="grid gap-2">
                        <Label htmlFor={`role-${m.id}`}>{t.staff.role}</Label>
                        <select id={`role-${m.id}`} name="role_id" className="h-11 rounded-md border border-input bg-background px-3" required>
                          {assignableRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </div>
                      <fieldset className="grid gap-2">
                        <legend className="text-sm font-medium">{t.staff.scope}</legend>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="radio" name="branch_scope" value="selected" defaultChecked /> {t.staff.scopeSelected}
                        </label>
                        <div className="grid gap-1 ps-6">
                          {(branches ?? []).map((b) => (
                            <label key={b.id} className="flex items-center gap-2 text-sm">
                              <input type="checkbox" name="branch_ids" value={b.id} /> {b.name}
                            </label>
                          ))}
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="radio" name="branch_scope" value="all" /> {t.staff.scopeAll}
                        </label>
                      </fieldset>
                      <SubmitButton size="sm">{t.staff.activate}</SubmitButton>
                    </ActionForm>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>

      <aside className="grid content-start gap-4">
        {can("staff.manage") ? (
          <Card>
            <CardHeader><CardTitle className="text-base">{t.staff.inviteTitle}</CardTitle></CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">{t.staff.inviteHelp}</p>
              <ActionForm action={inviteStaff}>
                <input type="hidden" name="restaurant_id" value={restaurantId} />
                <Field id="invite_name" label={t.staff.name}>
                  <Input name="full_name" required />
                </Field>
                <Field id="invite_phone" label={t.staff.mobile} hint={t.login.mobileHint}>
                  <Input name="phone" type="tel" inputMode="tel" dir="ltr" required />
                </Field>
                <div className="grid gap-2">
                  <Label htmlFor="intended_branch_id">{t.staff.intendedBranch}</Label>
                  <select id="intended_branch_id" name="intended_branch_id" className="h-11 rounded-md border border-input bg-background px-3">
                    <option value="">{t.staff.noBranch}</option>
                    {(branches ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <SubmitButton block>{t.staff.invite}</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader><CardTitle className="text-base">{t.staff.notifications}</CardTitle></CardHeader>
          <CardContent>
            {(notifications ?? []).length === 0 ? <p className="text-sm text-muted-foreground">{t.staff.noNotifications}</p> : null}
            <ul className="grid gap-2 text-sm">
              {(notifications ?? []).map((n) => (
                <li key={n.id}>
                  <span className="font-medium">{n.title}</span>
                  {(n.data as { name?: string })?.name ? ` — ${(n.data as { name?: string }).name}` : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
