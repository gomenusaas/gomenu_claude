import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/i18n";
import { qrSvg } from "@/lib/qr";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Print QR codes", robots: { index: false } };

/** A printable sheet: one card per table (optionally one branch), each with its QR code. */
export default async function PrintQr({ params, searchParams }: {
  params: Promise<{ restaurantId: string }>; searchParams: Promise<{ branch?: string }>;
}) {
  const { restaurantId } = await params;
  const { branch } = await searchParams;
  const { t } = await getDictionary();
  const supabase = await createClient();
  let query = supabase.from("qr_codes").select("id, token, restaurant_tables(label, section), branches(name)")
    .eq("restaurant_id", restaurantId).eq("kind", "table").eq("is_active", true).is("revoked_at", null);
  if (branch) query = query.eq("branch_id", branch);
  const [{ data: codes }, { data: r }] = await Promise.all([
    query, supabase.from("restaurants").select("name").eq("id", restaurantId).maybeSingle(),
  ]);
  if (!r) notFound();
  const cards = await Promise.all((codes ?? []).map(async (c) => ({ ...c, svg: await qrSvg(c.token) })));
  cards.sort((a, b) => ((a.restaurant_tables as { label: string } | null)?.label ?? "")
    .localeCompare((b.restaurant_tables as { label: string } | null)?.label ?? "", undefined, { numeric: true }));
  return (
    <main className="mx-auto grid max-w-4xl grid-cols-2 gap-4 p-6 print:p-0 md:grid-cols-3">
      {cards.map((c) => (
        <section key={c.id} className="grid break-inside-avoid justify-items-center gap-2 rounded-lg border p-4 text-center" data-testid="print-card">
          <p className="text-sm font-semibold">{r.name}</p>
          <div className="w-40" dangerouslySetInnerHTML={{ __html: c.svg }} />
          <p className="text-lg font-bold">{(c.restaurant_tables as { label: string } | null)?.label}</p>
          <p className="text-xs">{t.qr.printTitle}</p>
          <p className="text-xs text-muted-foreground">{(c.branches as { name: string } | null)?.name}</p>
        </section>
      ))}
    </main>
  );
}
