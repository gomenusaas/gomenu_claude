import { Alert } from "@gomenu/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { completeTestPayment } from "@/app/actions/order";
import { money } from "@/lib/site/money";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Test payment", robots: { index: false } };

type Checkout = {
  payment_id: string; status: string; amount_minor: number; currency: string; restaurant_name: string;
  order_number: number; public_key: string; slug: string; provider: string;
};

/**
 * GoMenu's built-in test gateway (decision P5: launch gateway decided later). Stands in for a
 * provider's hosted payment page. No card details are asked for and no money moves.
 */
export default async function TestGatewayPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(paymentId)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("payment_checkout", { p_payment_id: paymentId });
  const pay = data as unknown as Checkout | null;
  if (!pay || pay.provider !== "test") notFound();
  const back = `/${pay.slug}/order/${pay.public_key}`;
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-6 px-4 py-10">
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Test gateway · no real money</p>
        <h1 className="mt-2 text-xl font-semibold">{pay.restaurant_name}</h1>
        <p className="text-muted-foreground">Order #{pay.order_number}</p>
        <p className="mt-4 text-3xl font-bold" data-testid="test-pay-amount">{money(pay.amount_minor, pay.currency, "en")}</p>
        {pay.status === "pending" ? (
          <form action={completeTestPayment} className="mt-6 grid gap-2">
            <input type="hidden" name="payment_id" value={pay.payment_id} />
            <button name="outcome" value="approve" data-testid="test-pay-approve"
                    className="h-12 rounded-md bg-primary font-medium text-primary-foreground hover:opacity-90">Pay with test card</button>
            <button name="outcome" value="decline" data-testid="test-pay-decline"
                    className="h-11 rounded-md border font-medium hover:bg-muted">Decline</button>
          </form>
        ) : (
          <Alert tone="info" className="mt-6">This payment is {pay.status}.</Alert>
        )}
      </div>
      <Link href={back} className="text-center text-sm underline">Back to the order</Link>
    </main>
  );
}
