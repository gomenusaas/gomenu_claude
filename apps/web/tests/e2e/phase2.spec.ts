import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { totp } from "../shared/totp";

const db = new pg.Pool({
  connectionString: process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 2,
});

const ownerPhone = `+9689${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
const slug = `p2-${Date.now().toString(36)}`;
const restaurantName = `Phase Two Grill ${Date.now().toString(36)}`;

async function latest(phone: string, template: string, since: Date) {
  for (let i = 0; i < 40; i++) {
    const { rows } = await db.query(
      `select payload from private.message_outbox where to_phone_e164 = $1 and template = $2 and created_at > $3
        order by created_at desc limit 1`,
      [phone, template, since],
    );
    if (rows[0]) return rows[0].payload as Record<string, string>;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("no message");
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });
}

test.describe.serial("Phase 2: marketing → trial → plan → platform payment → active", () => {
  let restaurantPath = "";

  test.afterAll(async () => db.end());

  test("marketing site shows live pricing from the database, in English and Arabic", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Your restaurant online");
    await expect(page.getByTestId("plan-silver")).toContainText("$120");
    await expect(page.getByTestId("plan-gold")).toContainText("$180");
    await expect(page.getByTestId("plan-silver")).toContainText("$10/month");
    await shot(page, "p2-01-home");
    await page.goto("/pricing");
    await expect(page.getByTestId("plan-silver")).toContainText("Extra branch: $60 per year");
    await page.getByRole("button", { name: "العربية" }).first().click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("أسعار سنوية بسيطة");
    await shot(page, "p2-02-pricing-ar");
    await page.getByRole("button", { name: "English" }).first().click();
    // The language is saved by a server action; wait for it before navigating away.
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await page.goto("/terms");
    await expect(page.getByText("Draft for legal review")).toBeVisible();
  });

  test("owner starts a free trial from the marketing site and completes setup", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Start your 2-month free trial/ }).click();
    await page.getByLabel("Your name").fill("Layla Owner");
    await page.getByLabel("Mobile number").fill(ownerPhone);
    const since = new Date();
    await page.getByRole("button", { name: "Send code" }).click();
    await page.getByLabel("Verification code").fill((await latest(ownerPhone, "auth_otp", since)).otp);
    await page.getByRole("button", { name: "Verify" }).click();

    await page.getByLabel("Restaurant name").fill(restaurantName);
    await page.getByLabel("Web address").fill(slug);
    await page.getByLabel("I accept the Terms of Service").check();
    await page.getByRole("button", { name: "Create restaurant" }).click();
    await expect(page.getByRole("heading", { name: "Get your restaurant ready" })).toBeVisible();
    restaurantPath = new URL(page.url()).pathname.replace(/\/setup$/, "");

    const branch = page.getByTestId("setup-branch");
    await branch.getByLabel("Address").fill("Way 123, Qurum, Muscat");
    await branch.getByLabel("Branch phone").fill("+96824000000");
    await branch.getByRole("button", { name: "Save" }).click();
    await expect(branch.getByText("Done")).toBeVisible();
    await shot(page, "p2-03-setup");
  });

  test("owner chooses Silver during the trial and gets an invoice", async ({ page }) => {
    await loginOwner(page);
    await page.goto(`${restaurantPath}/billing`);
    await expect(page.getByTestId("billing-status")).toContainText("Free trial");
    await expect(page.getByTestId("billing-status")).toContainText("Gold");
    const silver = page.getByTestId("choose-silver");
    await silver.getByLabel("Extra branches").fill("1");
    await silver.getByRole("button", { name: "Get invoice" }).click();
    await expect(page.getByTestId("open-invoice")).toContainText("$180"); // $120 + 1 × $60, tax 0%
    await expect(page.getByTestId("open-invoice")).toContainText("Use the invoice number as the payment reference");
    await shot(page, "p2-04-invoice");
  });

  test("Finance signs in with password + authenticator app and records the bank transfer", async ({ page }) => {
    // Seeded demo finance user. First sign-in enrolls the authenticator (MFA mandatory).
    await db.query(`delete from auth.mfa_factors where user_id = 'd1000000-0000-4000-8000-000000000092'`);
    await page.goto("/platform/restaurants");
    await expect(page).toHaveURL(/\/platform\/login$/);
    await page.getByLabel("Email").fill("finance@demo.gomenu.test");
    await page.getByLabel("Password").fill("GoMenuDemo!2026");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Set up authenticator app" }).click();
    const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
    await page.getByLabel("6-digit code").fill(totp(secret));
    await shot(page, "p2-05-mfa");
    await page.getByRole("button", { name: "Verify and continue" }).click();
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

    await page.getByRole("link", { name: "Invoices" }).click();
    const invoice = page.getByTestId("platform-invoice").filter({ hasText: restaurantName });
    await expect(invoice).toContainText("$180");
    await invoice.getByLabel("Payment reference").fill(`E2E-${Date.now()}`);
    await shot(page, "p2-06-record-payment");
    await invoice.getByRole("button", { name: /Record payment/ }).click();
    await expect(page.getByText(/Payment recorded for GM-/)).toBeVisible();
    await expect(page.getByTestId("platform-invoice").filter({ hasText: restaurantName })).toBeVisible(); // now under "paid"

    // Finance cannot reach Super Admin pages; the database refuses even if the URL is typed.
    await page.goto("/platform/settings");
    await expect(page.getByRole("textbox")).toHaveCount(0);
  });

  test("owner sees the invoice paid and the Silver year scheduled after the trial", async ({ page }) => {
    await loginOwner(page);
    await page.goto(`${restaurantPath}/billing`);
    await expect(page.getByTestId("invoice-row").first()).toContainText("Paid");
    // Paid during the trial: the trial (Gold, unlimited branches) continues; Silver starts after it.
    await expect(page.getByTestId("billing-status")).toContainText("Paid: Silver starts");
    await expect(page.getByTestId("billing-status")).toContainText("Free trial");
  });

  test("a suspended restaurant shows the read-only banner to its owner", async ({ page }) => {
    const id = restaurantPath.split("/").pop();
    // Simulate time: run the lifecycle 40 days after all paid coverage ends (7 past due + 21 grace).
    await db.query(
      `select private.run_billing_lifecycle((select max(ends_at) from public.subscription_periods where restaurant_id = $1) + interval '40 days', $1)`,
      [id],
    );
    await loginOwner(page);
    await page.goto(restaurantPath);
    await expect(page.getByTestId("lifecycle-banner")).toContainText("suspended");
    await shot(page, "p2-07-suspended");
  });
});

async function loginOwner(page: Page) {
  await page.waitForTimeout(1500); // GoTrue: one code per number per second locally (60 s hosted)
  const { rows } = await db.query("select now() as now");
  await page.goto("/login");
  await page.getByLabel("Mobile number").fill(ownerPhone);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Verification code").fill((await latest(ownerPhone, "auth_otp", rows[0].now)).otp);
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/verify"));
}
