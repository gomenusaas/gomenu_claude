import { Alert, Card, CardContent, Field, Input } from "@gomenu/ui";
import Link from "next/link";
import { recordPayment, voidInvoice } from "@/app/actions/platform";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { formatDate, formatMoney } from "@/lib/format";
import { requirePlatformRole } from "@/lib/auth/platform";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Invoices" };

type Row = { id: string; number: string; restaurant_id: string; restaurant_name: string; kind: string; status: string;
             currency: string; total_minor: number; issued_at: string; due_at: string; plan_key: string };

// Manual payment recording (decision P2-Q1). Idempotent per (method, reference) in the database.
export default async function PlatformInvoices({ searchParams }: { searchParams: Promise<{ status?: string; notice?: string }> }) {
  await requirePlatformRole(["super_admin", "admin", "finance"]);
  const { status = "open", notice } = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_list_invoices", { p_status: status as never });
  if (error) return <p className="text-destructive">{error.message}</p>;
  const rows = (data ?? []) as unknown as Row[];
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Invoices</h1>
        {["open", "paid", "void"].map((s) => (
          <Link key={s} href={`/platform/invoices?status=${s}`} className={`rounded-md px-2 py-1 text-sm ${s === status ? "bg-muted font-medium" : ""}`}>{s}</Link>
        ))}
      </div>
      {notice ? <Alert tone="success">Payment recorded for {notice}; the subscription is updated.</Alert> : null}
      {rows.length === 0 ? <p className="text-muted-foreground">No {status} invoices.</p> : null}
      {rows.map((i) => (
        <Card key={i.id} data-testid="platform-invoice">
          <CardContent className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <div className="text-sm">
              <div className="font-medium">{i.number} · {i.restaurant_name}</div>
              <div className="text-muted-foreground">{i.kind} · {i.plan_key} · issued {formatDate(i.issued_at, "en")} · due {formatDate(i.due_at, "en")}</div>
              <div className="text-lg font-semibold">{formatMoney(i.total_minor, i.currency, "en")}</div>
            </div>
            {i.status === "open" ? (
              <>
                <ActionForm action={recordPayment} className="min-w-64">
                  <input type="hidden" name="invoice_id" value={i.id} />
                  <input type="hidden" name="amount_minor" value={i.total_minor} />
                  <input type="hidden" name="number" value={i.number} />
                  <div className="grid gap-2">
                    <label className="text-sm font-medium" htmlFor={`method-${i.id}`}>Method</label>
                    <select id={`method-${i.id}`} name="method" className="h-11 rounded-md border border-input bg-background px-3">
                      <option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="card_offline">Card (offline)</option>
                    </select>
                  </div>
                  <Field id={`ref-${i.id}`} label="Payment reference"><Input name="reference" required /></Field>
                  <SubmitButton>Record payment of {formatMoney(i.total_minor, i.currency, "en")}</SubmitButton>
                </ActionForm>
                <ActionForm action={voidInvoice} className="min-w-48">
                  <input type="hidden" name="invoice_id" value={i.id} />
                  <Field id={`void-${i.id}`} label="Void reason"><Input name="reason" required /></Field>
                  <SubmitButton variant="ghost">Void</SubmitButton>
                </ActionForm>
              </>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
