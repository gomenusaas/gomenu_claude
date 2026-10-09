import { notFound, permanentRedirect } from "next/navigation";
import { resolveSlug } from "@/lib/site/data";
import { renderSiteItem, siteMetadata } from "@/lib/site/page";

type Props = { params: Promise<{ slug: string; itemId: string }>; searchParams: Promise<{ lang?: string; branch?: string }> };

const UUID = /^[0-9a-f-]{36}$/;

export async function generateMetadata({ params, searchParams }: Props) {
  const { slug, itemId } = await params;
  const resolved = await resolveSlug(slug);
  return resolved && UUID.test(itemId) ? siteMetadata(resolved.restaurant_id, `/${resolved.slug}`, await searchParams, itemId) : {};
}

export default async function SiteItemPage({ params, searchParams }: Props) {
  const { slug, itemId } = await params;
  if (!UUID.test(itemId)) notFound();
  const resolved = await resolveSlug(slug);
  if (!resolved) notFound();
  if (resolved.redirect) permanentRedirect(`/${resolved.slug}/item/${itemId}`);
  return renderSiteItem(resolved.restaurant_id, itemId, `/${resolved.slug}`, await searchParams);
}
