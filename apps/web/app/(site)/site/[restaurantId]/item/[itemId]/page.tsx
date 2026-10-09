import { notFound } from "next/navigation";
import { renderSiteItem, siteMetadata } from "@/lib/site/page";

type Props = { params: Promise<{ restaurantId: string; itemId: string }>; searchParams: Promise<{ lang?: string; branch?: string }> };
const UUID = /^[0-9a-f-]{36}$/;

export async function generateMetadata({ params, searchParams }: Props) {
  const { restaurantId, itemId } = await params;
  return UUID.test(restaurantId) && UUID.test(itemId) ? siteMetadata(restaurantId, "", await searchParams, itemId) : {};
}

export default async function CustomDomainItem({ params, searchParams }: Props) {
  const { restaurantId, itemId } = await params;
  if (!UUID.test(restaurantId) || !UUID.test(itemId)) notFound();
  return renderSiteItem(restaurantId, itemId, "", await searchParams);
}
