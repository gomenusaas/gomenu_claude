import { expect, test, type Page } from "@playwright/test";
import pg from "pg";

const db = new pg.Pool({
  connectionString: process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 2,
});

const rand = () => String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
const ownerPhone = `+9689${rand()}`;
const staffPhone = `+9689${rand()}`;
const slug = `e2e-${Date.now().toString(36)}`;

/** Latest message for a phone; with `since`, only messages queued after that moment. */
async function outbox(phone: string, template: string, since = new Date(0)): Promise<Record<string, string>> {
  for (let i = 0; i < 40; i++) {
    const { rows } = await db.query(
      `select payload from private.message_outbox where to_phone_e164 = $1 and template = $2 and created_at > $3
        order by created_at desc limit 1`,
      [phone, template, since],
    );
    if (rows[0]) return rows[0].payload;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no ${template} for ${phone}`);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });
}

test.describe.serial("Phase 1: owner registers, invites staff; New Staff has zero access", () => {
  let restaurantPath = "";
  let token = "";

  test.afterAll(async () => db.end());

  test("owner registers with mobile + OTP and creates a restaurant", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Your name").fill("Noor Owner");
    await page.getByLabel("Mobile number").fill(ownerPhone);
    await shot(page, "01-register");
    await page.getByRole("button", { name: "Send code" }).click();

    await expect(page.getByRole("heading", { name: "Enter the code" })).toBeVisible();
    const { otp } = await outbox(ownerPhone, "auth_otp");
    await page.getByLabel("Verification code").fill(otp);
    await page.getByRole("button", { name: "Verify" }).click();

    await expect(page.getByRole("heading", { name: "Set up your restaurant" })).toBeVisible();
    await page.getByLabel("Restaurant name").fill("E2E Kitchen");
    await page.getByLabel("Web address").fill(slug);
    await page.getByLabel("First branch name").fill("Ruwi");
    await page.getByRole("button", { name: "Create restaurant" }).click();
    await expect(page.getByText("Please accept the Terms of Service to continue.")).toBeVisible();
    await page.getByLabel("I accept the Terms of Service").check();
    await shot(page, "02-onboarding");
    await page.getByRole("button", { name: "Create restaurant" }).click();

    // New restaurants land on the setup checklist (Phase 2).
    await expect(page.getByRole("heading", { name: "Get your restaurant ready" })).toBeVisible();
    restaurantPath = new URL(page.url()).pathname.replace(/\/setup$/, "");
    expect(restaurantPath).toMatch(/^\/r\/[0-9a-f-]{36}$/);
    await page.goto(restaurantPath);
    await expect(page.getByRole("heading", { name: "Welcome, Noor Owner" })).toBeVisible();
    await expect(page.getByText("Your role: Owner")).toBeVisible();
    await shot(page, "03-dashboard");

    // Logging back in later goes straight to the restaurant (routing decided by the DB).
    await page.goto("/app");
    await expect(page).toHaveURL(new RegExp(`${restaurantPath}$`));
  });

  test("owner invites a staff member by name + mobile", async ({ page }) => {
    await loginWithOtp(page, ownerPhone);
    await page.goto(`${restaurantPath}/staff`);
    await page.getByLabel("Full name").fill("Hamad Staff");
    await page.getByLabel("Mobile number").fill(staffPhone);
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByText("Invitation sent.")).toBeVisible();
    await expect(page.getByTestId("staff-row").filter({ hasText: "Hamad Staff" })).toContainText("Invitation sent");
    await shot(page, "04-staff-invited");
    token = (await outbox(staffPhone, "staff_invitation")).token;
    expect(token).toBeTruthy();
  });

  test("staff opens the WhatsApp link, verifies OTP, sets a PIN and lands in New Staff", async ({ page }) => {
    await page.goto(`/invite/${token}`);
    await expect(page.getByRole("heading", { name: "Join E2E Kitchen on GoMenu" })).toBeVisible();
    await expect(page.getByText(staffPhone)).toHaveCount(0); // only a masked number is shown
    await shot(page, "05-invite");
    await page.getByRole("button", { name: "Send code to my number" }).click();

    await expect(page.getByRole("heading", { name: "Enter the code" })).toBeVisible();
    const { otp } = await outbox(staffPhone, "auth_otp");
    await page.getByLabel("Verification code").fill(otp);
    await page.getByRole("button", { name: "Verify" }).click();

    await expect(page.getByRole("heading", { name: "Create your PIN" })).toBeVisible();
    await page.getByLabel("PIN", { exact: true }).fill("111111");
    await page.getByLabel("Confirm PIN").fill("111111");
    await page.getByRole("button", { name: "Save PIN" }).click();
    await expect(page.getByText("Choose a less predictable PIN.")).toBeVisible();

    await page.getByLabel("PIN", { exact: true }).fill("583920");
    await page.getByLabel("Confirm PIN").fill("583920");
    await page.getByRole("button", { name: "Save PIN" }).click();

    await expect(page.getByRole("heading", { name: "You're verified" })).toBeVisible();
    await expect(page.getByTestId("pending-membership")).toContainText("New Staff · awaiting role");
    await shot(page, "06-pending");

    // Zero access: the restaurant area does not exist for them...
    for (const path of [restaurantPath, `${restaurantPath}/staff`]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
    }
    // (Direct database/API access with a New Staff session is covered by tests/integration.)
    await page.goto("/app");
    await expect(page).toHaveURL(/\/pending$/);

    // A second use of the same link is refused.
    await page.goto(`/invite/${token}`);
    await expect(page.getByText("This invitation has already been used.")).toBeVisible();
  });

  test("owner is notified, assigns a role, and the staff member becomes active", async ({ browser }) => {
    const ownerPage = await (await browser.newContext()).newPage();
    await loginWithOtp(ownerPage, ownerPhone);
    await ownerPage.goto(`${restaurantPath}/staff`);
    await expect(ownerPage.getByText("New Staff Verified — Hamad Staff")).toBeVisible();
    const row = ownerPage.getByTestId("staff-row").filter({ hasText: "Hamad Staff" });
    await expect(row).toContainText("New Staff · awaiting role");
    await row.getByLabel("Role").selectOption({ label: "Waiter" });
    await row.getByLabel("Ruwi").check();
    await shot(ownerPage, "07-assign-role");
    await row.getByRole("button", { name: "Activate" }).click();
    await expect(row).toContainText("Active");

    const staffPage = await (await browser.newContext()).newPage();
    await loginWithOtp(staffPage, staffPhone);
    await expect(staffPage).toHaveURL(new RegExp(`${restaurantPath}$`));
    await expect(staffPage.getByText("Your role: Waiter")).toBeVisible();
  });

  test("Arabic UI switches to right-to-left", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "العربية" }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
    await shot(page, "08-login-ar");
  });

  test("seeded demo owner can log in with email + password", async ({ page }) => {
    await page.goto("/login?method=email");
    await page.getByLabel("Email").fill("owner@demo.gomenu.test");
    await page.getByLabel("Password").fill("GoMenuDemo!2026");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("Your role: Owner")).toBeVisible();
    await expect(page.getByText("Muscat Grill (Demo)")).toBeVisible();
  });
});

async function loginWithOtp(page: Page, phone: string) {
  const { rows } = await db.query("select now() as now");
  await page.goto("/login");
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("heading", { name: "Enter the code" })).toBeVisible();
  const { otp } = await outbox(phone, "auth_otp", rows[0].now);
  await page.getByLabel("Verification code").fill(otp);
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/verify"));
}
