import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderComposer } from "@/components/orders/composer";
import { requireUser } from "@/lib/auth/context";
import { fmt, getDictionary } from "@/lib/i18n";
import { tx } from "@/lib/i18n/text";
import { orderContext } from "@/lib/orders/data";
import { loadComposerMenu } from "@/lib/orders/menu";

export const metadata = { title: "Edit order" };

type Item = { item_id: string | null; variant_id: string | null; name: Record<string, string>; variant_name: Record<string, string> | null;
  options: { name: Record<string, string> }[]; quantity: number; unit_price_minor: number; notes: string | null };

/**
 * Edit an unpaid order. After the kitchen started, the change is audited (before/after) and the
 * kitchen is alerted (spec §10). Option choices are matched back to the current menu by name.
 */
export default async function EditOrder({ params }: { params: Promise<{ restaurantId: string; orderId: string }> }) {
  const { restaurantId, orderId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(orderId)) notFound();
  const ctx = await requireUser();
  if (!ctx.active_memberships?.some((m) => m.restaurant_id === restaurantId)) notFound();
  const { locale, t } = await getDictionary();
  const oc = await orderContext(restaurantId, ctx.user_id!);
  const { data: order } = await oc.supabase.from("orders").select("id, number, branch_id, status, currency").eq("id", orderId).maybeSingle();
  if (!order) notFound();
  const [menu, { data: rows }] = await Promise.all([
    loadComposerMenu(restaurantId),
    oc.supabase.from("order_items").select("item_id, variant_id, name, variant_name, options, quantity, unit_price_minor, notes").eq("order_id", orderId).order("sort"),
  ]);
  const lines = ((rows ?? []) as unknown as Item[]).filter((i) => i.item_id).map((i, n) => {
    const item = menu.items.find((x) => x.id === i.item_id);
    const optionIds = (item?.groups ?? []).flatMap((g) => g.options)
      .filter((o) => i.options.some((x) => tx(x.name, "en") === tx(o.name, "en"))).map((o) => o.id);
    const label = [tx(i.name, locale), i.variant_name ? tx(i.variant_name, locale) : null, ...i.options.map((o) => tx(o.name, locale))].filter(Boolean).join(" · ");
    return { key: `existing-${n}`, item_id: i.item_id!, variant_id: i.variant_id, option_ids: optionIds, quantity: i.quantity,
             notes: i.notes, label, unit: Number(i.unit_price_minor) };
  });
  return (
    <div className="grid gap-4">
      <Link href={`/r/${restaurantId}/orders/${orderId}`} className="text-sm underline">{t.orders.back}</Link>
      <h1 className="text-2xl font-semibold">{fmt(t.orders.editTitle, { n: order.number })}</h1>
      <OrderComposer restaurantId={restaurantId} branches={[]} defaultBranchId={order.branch_id} tables={[]} menu={menu}
                     currency={order.currency} locale={locale}
                     labels={{ ...t.orders.composer, branch: t.orders.branch, save: t.orders.save, total: t.orders.total,
                               editWarning: t.orders.editWarning, errors: t.orders.errors }}
                     edit={{ orderId, branchId: order.branch_id, lines, afterStart: ["preparing", "ready"].includes(order.status) }} />
    </div>
  );
}
