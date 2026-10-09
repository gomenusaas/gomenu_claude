import { type Browser, devices, expect, type Page, test } from "@playwright/test";
import pg from "pg";

// Phase 5 end to end on the seeded demo restaurant: a diner orders from a table QR code, the
// waiter (on shift) accepts and confirms, the kitchen prepares, the waiter serves, takes cash and
// completes, and the diner's page follows live. Then a pickup order paid online through the test
// gateway's signed webhook. Screenshots: test-results/screens/.
const db = new pg.Pool({
  connectionString: process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 2,
});

const R = "d0000000-0000-4000-8000-000000000001";
const WAITER = "+96899000003";   // Fatma, Qurum
const KITCHEN = "+96899000004";  // Said
const OWNER = "+96899000001";    // Aisha
const MIXED_GRILL = "d5000000-0000-4000-8000-000000000003";
const LEMON_MINT = "d5000000-0000-4000-8000-000000000005";

async function latest(phone: string, template: string, since: Date) {
  for (let i = 0; i < 40; i++) {
    const { rows } = await db.query(
      `select payload from private.message_outbox where to_phone_e164 = $1 and template = $2 and created_at > $3
        order by created_at desc limit 1`, [phone, template, since]);
    if (rows[0]) return rows[0].payload as Record<string, string>;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("no message");
}
const dbNow = async (): Promise<Date> => (await db.query("select now() as now")).rows[0].now;

async function shot(page: Page, name: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${name} scrolls horizontally`).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });
}

async function staff(browser: Browser, phone: string, device: keyof typeof devices = "Pixel 7") {
  const context = await browser.newContext({ ...devices[device] });
  const page = await context.newPage();
  await page.waitForTimeout(1500); // GoTrue: one code per number per second locally
  const since = await dbNow();
  await page.goto("/login");
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Verification code").fill((await latest(phone, "auth_otp", since)).otp);
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/verify") && !url.pathname.startsWith("/login"));
  return page;
}

async function addToOrder(page: Page, itemId: string, option?: string) {
  await page.goto(`/demo-muscat-grill/item/${itemId}`);
  if (option) await page.getByLabel(option).check();
  await page.getByTestId("add-to-cart-button").click();
  await expect(page.getByTestId("cart-bar")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "the dish page scrolls sideways with the order bar").toBeLessThanOrEqual(0);
}

/**
 * Follow the floating "View order" bar. Taps on fixed elements in emulated mobile Chrome land
 * off target on CI runners, so the test follows the bar's link rather than its coordinates.
 */
async function openCart(page: Page) {
  const bar = page.getByTestId("cart-bar");
  await expect(bar).toHaveAttribute("href", /\/checkout(\?|$)/);
  await page.goto((await bar.getAttribute("href"))!);
}

test.describe.serial("Phase 5: ordering, waiters, kitchen, payments", () => {
  test.beforeAll(async () => {
    // Opening hours must not decide the test: both demo branches are open now.
    await db.query("update public.branches set status_override = 'open', override_until = null where restaurant_id = $1", [R]);
  });
  test.afterAll(async () => {
    await db.query("update public.branches set status_override = 'auto' where restaurant_id = $1", [R]);
    await db.end();
  });

  test("table QR order: waiter confirms, kitchen prepares, waiter serves and takes cash, diner follows live", async ({ page, browser }) => {
    // Diner at table T1.
    await page.goto("/q/demo-muscat-grill-table-t1");
    await page.goto(`/demo-muscat-grill/item/${MIXED_GRILL}`);
    await expect(page.getByTestId("add-to-cart")).toBeVisible();
    // Full-page screenshots on an emulated phone can shift fixed elements, so shoot before adding.
    await shot(page, "p5-01-add-to-order");
    await addToOrder(page, MIXED_GRILL, "Garlic sauce");
    await openCart(page);
    await expect(page.getByTestId("checkout-line")).toHaveCount(1);
    await expect(page.getByLabel(/At my table/)).toBeChecked();
    await expect(page.getByTestId("checkout-total")).toHaveText("OMR 6.100");
    await page.getByLabel("Your name").fill("Salim");
    await shot(page, "p5-02-checkout");
    await page.getByTestId("place-order").click();
    await expect(page.getByTestId("order-tracker")).toHaveAttribute("data-status", "new");
    const orderUrl = page.url();
    const key = orderUrl.split("/order/")[1].split("?")[0];
    const { rows } = await db.query("select number, total_minor from public.orders where public_key = $1", [key]);
    expect(Number(rows[0].total_minor)).toBe(6100);  // priced by the server from the menu
    const number = String(rows[0].number);
    await shot(page, "p5-03-tracking-waiting");

    // Waiter: start shift, accept, confirm the table.
    const waiter = await staff(browser, WAITER);
    await waiter.goto(`/r/${R}/orders`);
    const shift = waiter.getByTestId("shift-toggle");
    if ((await shift.textContent())?.includes("Start")) await shift.click();
    await expect(waiter.getByTestId("shift-toggle")).toHaveText("End shift");
    const card = waiter.locator(`[data-testid=order-card][data-order-number="${number}"]`);
    await card.getByTestId("order-accept").click();
    await expect(card).toContainText("Waiter: you");
    await card.getByTestId("order-confirm").click();
    await expect(card).toHaveAttribute("data-status", "confirmed");
    await shot(waiter, "p5-04-waiter-board");
    await expect(page.locator("[data-testid=order-step][data-reached=true]")).toHaveCount(3, { timeout: 30_000 });  // live

    // Kitchen (tablet): the ticket is there now; start and finish it.
    const kitchen = await staff(browser, KITCHEN, "iPad (gen 7) landscape");
    await kitchen.goto(`/r/${R}/kitchen`);
    const ticket = kitchen.getByTestId("kitchen-ticket").filter({ hasText: `#${number}` });
    await expect(ticket).toContainText("Mixed grill");
    await expect(ticket).toContainText("Garlic sauce");
    await ticket.getByTestId("kitchen-start").click();
    await expect(ticket).toHaveAttribute("data-status", "preparing");
    await shot(kitchen, "p5-05-kitchen");
    await ticket.getByTestId("kitchen-ready").click();
    await expect(ticket).toHaveAttribute("data-status", "ready");

    // Waiter: serve, cash, complete. The diner's page follows.
    await waiter.reload();
    await card.getByTestId("order-served").click();
    await expect(card).toHaveAttribute("data-status", "served");
    await card.getByTestId("order-cash").click();
    await expect(card.getByTestId("order-complete")).toBeVisible();
    await card.getByTestId("order-complete").click();
    await expect(waiter.getByTestId("closed-order").filter({ hasText: `#${number}` })).toBeVisible();
    await waiter.goto(`/r/${R}/orders`);
    await waiter.getByTestId("closed-order").filter({ hasText: `#${number}` }).getByRole("link").click();
    await expect(waiter.getByTestId("order-timeline").locator("[data-event]")).toHaveCount(9);
    await shot(waiter, "p5-06-order-detail");

    await expect(page.getByTestId("order-tracker")).toHaveAttribute("data-status", "completed", { timeout: 30_000 });
    await expect(page.getByTestId("payment-status")).toHaveText("Paid");
    await shot(page, "p5-07-tracking-completed");
    await waiter.context().close();
    await kitchen.context().close();
  });

  test("pickup paid online: only the signed webhook marks it paid; forged webhooks are refused", async ({ page }) => {
    await addToOrder(page, LEMON_MINT);
    await openCart(page);
    await page.getByLabel("Pickup").check();
    await page.getByTestId("checkout-branch").selectOption({ label: "Qurum" });
    await page.getByTestId("place-order").click();
    await expect(page.getByTestId("order-tracker")).toHaveAttribute("data-status", "confirmed");
    await expect(page.getByTestId("payment-status")).toHaveText("Not paid yet");
    const key = page.url().split("/order/")[1].split("?")[0];

    await page.getByTestId("pay-now").click();
    await expect(page.getByTestId("test-pay-amount")).toHaveText("OMR 1");
    const paymentId = page.url().split("/pay/test/")[1];
    // A forged "success" without the gateway's signature is rejected and changes nothing.
    const forged = await page.request.post("/api/payments/webhook/test", {
      data: { id: "evt_forged", type: "payment.succeeded", payment_id: paymentId, amount_minor: 1000, currency: "OMR" },
    });
    expect(forged.status()).toBe(401);
    expect((await db.query("select payment_status from public.orders where public_key = $1", [key])).rows[0].payment_status).toBe("unpaid");

    await page.getByTestId("test-pay-approve").click();
    await expect(page.getByTestId("order-tracker")).toHaveAttribute("data-payment-status", "paid");
    const { rows } = await db.query("select kitchen_released_at is not null as released from public.orders where public_key = $1", [key]);
    expect(rows[0].released).toBe(true);   // pay-before order goes to the kitchen once paid
    await shot(page, "p5-08-paid-online");
  });

  test("owner: ordering settings, payments page, waiter order for a car", async ({ browser }) => {
    const owner = await staff(browser, OWNER);
    await owner.goto(`/r/${R}/ordering`);
    await expect(owner.getByLabel("Open to waiters on shift — first to accept takes it")).toBeChecked();
    await expect(owner.getByLabel("VAT rate (%)")).toHaveValue("5");
    await shot(owner, "p5-09-ordering-settings");
    await owner.goto(`/r/${R}/payments`);
    await expect(owner.getByTestId("gateway").filter({ hasText: "GoMenu test gateway" }).getByTestId("gateway-status")).toHaveText("Connected");
    await shot(owner, "p5-10-payments");

    await owner.goto(`/r/${R}/orders/new`);
    await owner.getByLabel("Car", { exact: true }).check();
    await owner.getByLabel("Car plate").fill("1234 AB");
    await owner.getByTestId("composer-item").filter({ hasText: "Hummus" }).click();
    await owner.getByTestId("composer-submit").click();
    await expect(owner.getByTestId("order-title")).toContainText("Car 1234 AB");
    await expect(owner.getByTestId("order-status")).toHaveText("Confirmed");
    await shot(owner, "p5-11-waiter-order");
    await owner.context().close();
  });
});
