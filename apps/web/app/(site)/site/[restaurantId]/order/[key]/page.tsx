import { notFound } from "next/navigation";
import { renderOrder } from "@/lib/site/page";

// Custom domains: the proxy rewrites https://www.myrestaurant.com/order/{key} to here.
type Props = { params: Promise<{ restaurantId: string; key: string }>; searchParams: Promise<{ lang?: string }> };
const UUID = /^[0-9a-f-]{36}$/;

export const metadata = { title: "Your order", robots: { index: false } };

export default async function CustomDomainOrder({ params, searchParams }: Props) {
  const { restaurantId, key } = await params;
  if (!UUID.test(restaurantId)) notFound();
  return renderOrder(restaurantId, key, "", await searchParams);
}
