import { notFound, permanentRedirect } from "next/navigation";
import { resolveSlug } from "@/lib/site/data";
import { renderOrder } from "@/lib/site/page";

type Props = { params: Promise<{ slug: string; key: string }>; searchParams: Promise<{ lang?: string }> };

export const metadata = { title: "Your order", robots: { index: false } };

export default async function OrderPage({ params, searchParams }: Props) {
  const { slug, key } = await params;
  const resolved = await resolveSlug(slug);
  if (!resolved) notFound();
  if (resolved.redirect) permanentRedirect(`/${resolved.slug}/order/${key}`);
  return renderOrder(resolved.restaurant_id, key, `/${resolved.slug}`, await searchParams);
}
