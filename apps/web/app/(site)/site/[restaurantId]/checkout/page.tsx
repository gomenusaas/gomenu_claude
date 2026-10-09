import { notFound } from "next/navigation";
import { renderCheckout } from "@/lib/site/page";

// Custom domains: the proxy rewrites https://www.myrestaurant.com/checkout to here.
type Props = { params: Promise<{ restaurantId: string }>; searchParams: Promise<{ lang?: string; branch?: string }> };
const UUID = /^[0-9a-f-]{36}$/;

export const metadata = { title: "Your order", robots: { index: false } };

export default async function CustomDomainCheckout({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  if (!UUID.test(restaurantId)) notFound();
  return renderCheckout(restaurantId, "", await searchParams);
}
