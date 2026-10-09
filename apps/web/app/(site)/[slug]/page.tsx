import { notFound, permanentRedirect } from "next/navigation";
import { resolveSlug } from "@/lib/site/data";
import { renderSiteHome, siteMetadata } from "@/lib/site/page";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string; branch?: string }> };

/** gomenu.om/{slug}. Old slugs redirect permanently to the current one (spec §7). */
async function restaurantFor(slug: string, search: Record<string, string | undefined>) {
  const resolved = await resolveSlug(slug);
  if (!resolved) notFound();
  if (resolved.redirect) {
    const q = new URLSearchParams(Object.entries(search).filter(([, v]) => v) as [string, string][]).toString();
    permanentRedirect(`/${resolved.slug}${q ? `?${q}` : ""}`);
  }
  return resolved.restaurant_id;
}

export async function generateMetadata({ params, searchParams }: Props) {
  const { slug } = await params;
  const resolved = await resolveSlug(slug);
  return resolved ? siteMetadata(resolved.restaurant_id, `/${resolved.slug}`, await searchParams) : {};
}

export default async function RestaurantSite({ params, searchParams }: Props) {
  const { slug } = await params;
  const search = await searchParams;
  const id = await restaurantFor(slug, search);
  return renderSiteHome(id, `/${slug.toLowerCase()}`, search);
}
