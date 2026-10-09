import { notFound, permanentRedirect } from "next/navigation";
import { resolveSlug } from "@/lib/site/data";
import { renderCheckout } from "@/lib/site/page";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string; branch?: string }> };

export const metadata = { title: "Your order", robots: { index: false } };

export default async function CheckoutPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const resolved = await resolveSlug(slug);
  if (!resolved) notFound();
  if (resolved.redirect) permanentRedirect(`/${resolved.slug}/checkout`);
  return renderCheckout(resolved.restaurant_id, `/${resolved.slug}`, await searchParams);
}
