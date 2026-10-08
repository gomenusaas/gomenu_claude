import { Badge, Card, CardContent, CardHeader, CardTitle, Field, Input } from "@gomenu/ui";
import { addStaff, setStaffActive } from "@/app/actions/platform";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { requirePlatformRole } from "@/lib/auth/platform";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Platform staff" };

type Staff = { user_id: string; role: string; is_active: boolean; email: string; full_name: string | null; mfa: boolean };

export default async function PlatformStaff() {
  await requirePlatformRole(["super_admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_list_staff");
  if (error) return <p className="text-destructive">{error.message}</p>;
  const staff = (data ?? []) as unknown as Staff[];
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Platform staff</h1>
      <Card><CardContent className="grid gap-2">
        {staff.map((s) => (
          <div key={s.user_id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm">
            <span>{s.full_name ?? s.email} · {s.email}</span>
            <span className="flex items-center gap-2">
              <Badge>{s.role}</Badge>
              <Badge tone={s.mfa ? "success" : "warning"}>{s.mfa ? "MFA on" : "MFA not set up"}</Badge>
              <ActionForm action={setStaffActive} className="gap-0">
                <input type="hidden" name="user_id" value={s.user_id} />
                <input type="hidden" name="active" value={String(!s.is_active)} />
                <SubmitButton size="sm" variant="ghost">{s.is_active ? "Disable" : "Enable"}</SubmitButton>
              </ActionForm>
            </span>
          </div>
        ))}
      </CardContent></Card>
      <Card><CardHeader><CardTitle as="h2" className="text-base">Add platform staff</CardTitle></CardHeader><CardContent>
        <ActionForm action={addStaff}>
          <Field id="email" label="Email of an existing, confirmed account"><Input name="email" type="email" required /></Field>
          <div className="grid gap-2">
            <label htmlFor="role" className="text-sm font-medium">Role</label>
            <select id="role" name="role" className="h-11 rounded-md border border-input bg-background px-3">
              {["super_admin", "admin", "support", "finance", "content", "discovery"].map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <SubmitButton>Add</SubmitButton>
        </ActionForm>
      </CardContent></Card>
    </div>
  );
}
