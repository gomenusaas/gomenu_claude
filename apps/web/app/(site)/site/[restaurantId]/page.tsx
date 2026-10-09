import { notFound } from "next/navigation";
import { renderSiteHome, siteMetadata } from "@/lib/site/page";

// Custom domains: the proxy rewrites https://www.myrestaurant.com/ to here (see proxy.ts).
type Props = { params: Promise<{ restaurantId: string }>; searchParams: Promise<{ lang?: string; branch?: string }> };
const UUID = /^[0-9a-f-]{36}$/;

export async function generateMetadata({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  return UUID.test(restaurantId) ? siteMetadata(restaurantId, "", await searchParams) : {};
}

export default async function CustomDomainSite({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  if (!UUID.test(restaurantId)) notFound();
  return renderSiteHome(restaurantId, "", await searchParams);
}
