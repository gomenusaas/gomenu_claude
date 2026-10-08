import { requirePlatformRole } from "@/lib/auth/platform";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Platform audit" };

// Read-only: the platform audit log is append-only in the database.
export default async function PlatformAudit() {
  await requirePlatformRole(["super_admin"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_audit_events")
    .select("id, occurred_at, actor_email, actor_platform_role, action, object_type, restaurant_id, reason")
    .order("occurred_at", { ascending: false })
    .limit(100);
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">Platform audit log</h1>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50"><tr>{["When", "Who", "Action", "Object", "Reason"].map((h) => <th key={h} className="p-2 text-start font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {(data ?? []).map((e) => (
              <tr key={e.id} className="border-t">
                <td className="p-2 whitespace-nowrap">{new Date(e.occurred_at).toISOString().replace("T", " ").slice(0, 19)}</td>
                <td className="p-2">{e.actor_email ?? "system"} {e.actor_platform_role ? `(${e.actor_platform_role})` : ""}</td>
                <td className="p-2 font-mono">{e.action}</td>
                <td className="p-2">{e.object_type}</td>
                <td className="p-2">{e.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
