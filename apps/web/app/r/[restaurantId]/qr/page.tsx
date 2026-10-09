import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Label } from "@gomenu/ui";
import { notFound } from "next/navigation";
import { addTable, archiveTable, createGeneralQr, regenerateTableQr, revokeGeneralQr, setTableActive } from "@/app/actions/qr";
import { ActionForm } from "@/components/action-form";
import { RowAction } from "@/components/row-action";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth/context";
import { fmt, getDictionary } from "@/lib/i18n";
import { qrSvg, qrUrl } from "@/lib/qr";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "QR codes" };

type Qr = { id: string; token: string; kind: "general" | "table"; label: string | null; branch_id: string | null; table_id: string | null; is_active: boolean };

export default async function QrPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const ctx = await requireUser();
  if (!ctx.active_memberships?.some((m) => m.restaurant_id === restaurantId)) notFound();
  const { t } = await getDictionary();
  const supabase = await createClient();
  const [{ data: perms }, { data: codes }, { data: tables }, { data: branches }] = await Promise.all([
    supabase.rpc("my_permissions", { p_restaurant_id: restaurantId }),
    supabase.from("qr_codes").select("id, token, kind, label, branch_id, table_id, is_active").eq("restaurant_id", restaurantId).is("revoked_at", null),
    supabase.from("restaurant_tables").select("id, branch_id, label, section, is_active").eq("restaurant_id", restaurantId).is("archived_at", null).order("label"),
    supabase.from("branches").select("id, name").eq("restaurant_id", restaurantId).is("archived_at", null).order("sort"),
  ]);
  const can = (p: string) => (perms ?? []).includes(p);
  if (!can("qr.manage")) notFound();
  const all = (codes ?? []) as Qr[];
  const svgs = new Map(await Promise.all(all.map(async (q) => [q.id, await qrSvg(q.token)] as const)));
  const scans = new Map<string, number>();
  if (can("analytics.view") && all.length) {
    const { data: events } = await supabase.from("analytics_events").select("qr_code_id").eq("restaurant_id", restaurantId)
      .eq("event_type", "qr_scan").eq("is_internal", false).in("qr_code_id", all.map((q) => q.id));
    for (const e of events ?? []) scans.set(e.qr_code_id!, (scans.get(e.qr_code_id!) ?? 0) + 1);
  }
  const base = { restaurant_id: restaurantId };
  const downloads = (q: Qr) => (
    <span className="flex gap-2 text-sm">
      <a className="underline" href={`/r/${restaurantId}/qr/download/${q.id}`} data-testid="qr-download">{t.qr.download}</a>
      <a className="underline" href={`/r/${restaurantId}/qr/download/${q.id}?format=svg`}>{t.qr.downloadSvg}</a>
    </span>
  );

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.qr.title}</h1>
        <p className="text-muted-foreground">{t.qr.body}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">{t.qr.general}</CardTitle>
          <CardDescription>{t.qr.generalBody}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ul className="grid gap-3 sm:grid-cols-2">
            {all.filter((q) => q.kind === "general").map((q) => (
              <li key={q.id} className="flex gap-3 rounded-md border p-3" data-testid="general-qr">
                <div className="w-24 shrink-0" dangerouslySetInnerHTML={{ __html: svgs.get(q.id) ?? "" }} />
                <div className="grid content-start gap-1">
                  <span className="font-medium">{q.label ?? "QR"}</span>
                  <span className="break-all text-xs text-muted-foreground" dir="ltr">{qrUrl(q.token)}</span>
                  {scans.has(q.id) || can("analytics.view") ? <span className="text-xs">{fmt(t.qr.scans, { n: scans.get(q.id) ?? 0 })}</span> : null}
                  {downloads(q)}
                  <div><RowAction action={revokeGeneralQr} fields={{ ...base, id: q.id }} label={t.qr.revoke} /></div>
                </div>
              </li>
            ))}
          </ul>
          <ActionForm action={createGeneralQr} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="restaurant_id" value={restaurantId} />
            <Field id="qr-label" label={t.qr.label}><Input name="label" className="w-64" /></Field>
            <SubmitButton size="sm" variant="outline">{t.qr.createGeneral}</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle as="h2" className="text-base">{t.qr.tables}</CardTitle>
            <CardDescription>{t.qr.tablesBody}</CardDescription>
          </div>
          <a href={`/print/qr/${restaurantId}`} target="_blank" rel="noopener" className="rounded-md border px-3 py-2 text-sm hover:bg-muted">{t.qr.print}</a>
        </CardHeader>
        <CardContent className="grid gap-6">
          {(branches ?? []).map((b) => {
            const rows = (tables ?? []).filter((x) => x.branch_id === b.id);
            return (
              <section key={b.id} className="grid gap-3" aria-label={b.name}>
                <h3 className="font-medium">{b.name}</h3>
                {!rows.length ? <p className="text-sm text-muted-foreground">{t.qr.empty}</p> : null}
                <ul className="grid gap-3 sm:grid-cols-2">
                  {rows.map((row) => {
                    const q = all.find((x) => x.table_id === row.id);
                    return (
                      <li key={row.id} className="flex gap-3 rounded-md border p-3" data-testid="table-row">
                        {q ? <div className="w-24 shrink-0" dangerouslySetInnerHTML={{ __html: svgs.get(q.id) ?? "" }} /> : null}
                        <div className="grid content-start gap-1">
                          <span className="flex items-center gap-2 font-medium">
                            {row.label}{row.section ? <span className="text-xs text-muted-foreground">· {row.section}</span> : null}
                            {!row.is_active ? <Badge>{t.qr.inactive}</Badge> : null}
                          </span>
                          {q && can("analytics.view") ? <span className="text-xs">{fmt(t.qr.scans, { n: scans.get(q.id) ?? 0 })}</span> : null}
                          {q ? downloads(q) : null}
                          <div className="flex flex-wrap gap-1">
                            <RowAction action={regenerateTableQr} fields={{ ...base, id: row.id }} label={t.qr.regenerate} variant="outline" testId="qr-regenerate" />
                            <RowAction action={setTableActive} fields={{ ...base, id: row.id, active: String(!row.is_active) }}
                                       label={row.is_active ? t.qr.deactivate : t.qr.activate} />
                            <RowAction action={archiveTable} fields={{ ...base, id: row.id }} label={t.qr.archive} />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          <ActionForm action={addTable} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="restaurant_id" value={restaurantId} />
            <div className="grid gap-2">
              <Label htmlFor="table-branch">{t.qr.branch}</Label>
              <select id="table-branch" name="branch_id" className="h-11 rounded-md border border-input bg-background px-3">
                {(branches ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <Field id="table-label" label={t.qr.table}><Input name="label" className="w-40" /></Field>
            <Field id="table-section" label={t.qr.section}><Input name="section" className="w-40" /></Field>
            <SubmitButton size="sm">{t.qr.addTable}</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
