import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderComposer } from "@/components/orders/composer";
import { requireUser } from "@/lib/auth/context";
import { getDictionary } from "@/lib/i18n";
import { orderContext } from "@/lib/orders/data";
import { loadComposerMenu } from "@/lib/orders/menu";

export const metadata = { title: "New waiter order" };

/** spec §10 waiter-created orders: table or car (plate required); the creator is responsible. */
export default async function NewWaiterOrder({ params, searchParams }: {
  params: Promise<{ restaurantId: string }>; searchParams: Promise<{ branch?: string }>;
}) {
  const { restaurantId } = await params;
  const { branch } = await searchParams;
  const ctx = await requireUser();
  const membership = ctx.active_memberships?.find((m) => m.restaurant_id === restaurantId);
  if (!membership) notFound();
  const { locale, t } = await getDictionary();
  const oc = await orderContext(restaurantId, ctx.user_id!);
  if (!oc.can("orders.create_waiter") || !oc.myBranches.length) notFound();
  const [menu, { data: r }] = await Promise.all([
    loadComposerMenu(restaurantId),
    oc.supabase.from("restaurants").select("currency").eq("id", restaurantId).single(),
  ]);
  return (
    <div className="grid gap-4">
      <Link href={`/r/${restaurantId}/orders`} className="text-sm underline">{t.orders.back}</Link>
      <h1 className="text-2xl font-semibold">{t.orders.composer.title}</h1>
      <OrderComposer restaurantId={restaurantId} branches={oc.myBranches}
                     defaultBranchId={oc.myBranches.some((b) => b.id === branch) ? branch! : oc.myBranches[0].id}
                     tables={oc.tables.filter((x) => x.is_active)} menu={menu} currency={r?.currency ?? "OMR"} locale={locale}
                     labels={{ ...t.orders.composer, branch: t.orders.branch, save: t.orders.save, total: t.orders.total,
                               editWarning: t.orders.editWarning, errors: t.orders.errors }} />
    </div>
  );
}
