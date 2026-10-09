import { renderSiteHome } from "@/lib/site/page";

export const metadata = { title: "Preview", robots: { index: false } };

// Staff preview (website.manage): unpublished, and any template with the restaurant's own content.
type Props = { params: Promise<{ restaurantId: string }>; searchParams: Promise<{ lang?: string; branch?: string; template?: string }> };

export default async function SitePreview({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  return renderSiteHome(restaurantId, `/preview/${restaurantId}`, await searchParams, true);
}
