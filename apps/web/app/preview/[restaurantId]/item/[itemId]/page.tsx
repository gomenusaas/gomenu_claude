import { renderSiteItem } from "@/lib/site/page";

export const metadata = { title: "Preview", robots: { index: false } };

type Props = { params: Promise<{ restaurantId: string; itemId: string }>; searchParams: Promise<{ lang?: string; branch?: string; template?: string }> };

export default async function SitePreviewItem({ params, searchParams }: Props) {
  const { restaurantId, itemId } = await params;
  return renderSiteItem(restaurantId, itemId, `/preview/${restaurantId}`, await searchParams, true);
}
