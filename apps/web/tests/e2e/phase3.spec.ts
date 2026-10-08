import { expect, test, type Page } from "@playwright/test";
import pg from "pg";

// Phase 3 end to end, against the production build with GOMENU_AI_PROVIDER=fake and no Vercel
// token (the domain stand-in). Screenshots land in test-results/screens/.
const db = new pg.Pool({
  connectionString: process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 2,
});

const ownerPhone = `+9689${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
const slug = `p3-${Date.now().toString(36)}`;
const restaurantName = `Phase Three Kitchen ${Date.now().toString(36)}`;
const PIN = "583920";
// A valid 2x2 PNG (createImageBitmap must be able to decode it).
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==",
  "base64",
);

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

async function dbNow(): Promise<Date> {
  const { rows } = await db.query("select now() as now");
  return rows[0].now;
}

async function shot(page: Page, name: string) {
  // Mobile-first: no page may scroll sideways on a phone.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${name} scrolls horizontally`).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });
}

async function login(page: Page) {
  // GoTrue allows one code per number per second locally (60s hosted); tests log in back to back.
  await page.waitForTimeout(1500);
  const since = await dbNow();
  await page.goto("/login");
  await page.getByLabel("Mobile number").fill(ownerPhone);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Verification code").fill((await latest(ownerPhone, "auth_otp", since)).otp);
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/verify"));
}

test.describe.serial("Phase 3: security, menu, AI, website", () => {
  let base = "";

  test.afterAll(async () => db.end());

  test("owner registers; the dashboard shows real numbers", async ({ page }) => {
    const since = await dbNow();
    await page.goto("/register");
    await page.getByLabel("Your name").fill("Noor Owner");
    await page.getByLabel("Mobile number").fill(ownerPhone);
    await page.getByRole("button", { name: "Send code" }).click();
    await page.getByLabel("Verification code").fill((await latest(ownerPhone, "auth_otp", since)).otp);
    await page.getByRole("button", { name: "Verify" }).click();
    await page.getByLabel("Restaurant name").fill(restaurantName);
    await page.getByLabel("Web address").fill(slug);
    await page.getByLabel("I accept the Terms of Service").check();
    await page.getByRole("button", { name: "Create restaurant" }).click();
    await page.waitForURL(/\/r\/[0-9a-f-]+\/setup$/);
    base = new URL(page.url()).pathname.replace(/\/setup$/, "");
    await page.goto(base);
    await expect(page.getByTestId("stat-items")).toHaveText("0");
    await expect(page.getByTestId("stat-credits")).toHaveText("100");
    await expect(page.getByTestId("dashboard-branch")).toHaveCount(1);
    await shot(page, "p3-01-dashboard");
  });

  test("owner sets a PIN, locks the screen and unlocks from the staff switcher", async ({ page }) => {
    await login(page);
    await page.goto("/account");
    const pinCard = page.getByTestId("pin-card");
    await pinCard.getByLabel("PIN", { exact: true }).fill(PIN);
    await pinCard.getByLabel("Confirm PIN").fill(PIN);
    await pinCard.getByRole("button", { name: "Set a new PIN" }).click();
    await expect(page.getByText("PIN saved.")).toBeVisible();
    // One trusted device per browser that logged in with a code: registration + this login.
    await expect(page.getByTestId("device-row")).toHaveCount(2);

    await page.goto(base);
    await page.getByTestId("lock-button").click();
    await page.waitForURL("**/lock");
    await expect(page.getByTestId("parked-user")).toContainText("Noor Owner");
    await shot(page, "p3-02-switcher");
    // Locked means signed out in this browser: protected pages bounce to login.
    const blocked = await page.request.get(base, { maxRedirects: 0 });
    expect([303, 307, 308]).toContain(blocked.status());

    await page.getByTestId("parked-user").click();
    await page.getByLabel("PIN").fill("111111");
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByText(/Incorrect PIN\. \d tries left\./)).toBeVisible();
    await page.getByLabel("PIN").fill(PIN);
    await page.getByRole("button", { name: "Unlock" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/lock"));
    await page.goto(base);
    await expect(page.getByRole("heading", { name: "Welcome, Noor Owner" })).toBeVisible();
  });

  test("re-authentication: a fresh code returns the person to where they were", async ({ page }) => {
    await login(page);
    const since = await dbNow();
    await page.goto(`/reauth?next=${encodeURIComponent(`${base}/settings`)}`);
    await page.waitForTimeout(1500); // see login()
    await page.getByRole("button", { name: "Send code" }).click();
    await page.getByLabel("Verification code").fill((await latest(ownerPhone, "auth_otp", since)).otp);
    await page.getByRole("button", { name: "Verify" }).click();
    await page.waitForURL(`**${base}/settings`);
  });

  test("settings and branches: profile, Arabic, hours and a manual 'closed' override", async ({ page }) => {
    await login(page);
    await page.goto(`${base}/settings`);
    await page.getByLabel("Arabic · العربية").check();
    await page.getByRole("button", { name: "Save" }).nth(1).click();
    await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible();
    await page.reload();
    await page.getByLabel("Tagline (English)").fill("Fresh grills every day");
    await page.getByLabel("Tagline (Arabic)").fill("مشاوي طازجة كل يوم");
    await page.getByRole("button", { name: "Save" }).first().click();
    await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible();
    await page.getByTestId("logo-input").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
    await expect(page.locator('img[src*="/brand/logo-"]')).toBeVisible();
    await shot(page, "p3-03-settings");

    await page.goto(`${base}/branches`);
    const card = page.getByTestId("branch-card").first();
    await card.locator("summary", { hasText: "Opening hours" }).click();
    await card.getByRole("checkbox", { name: "Sunday" }).check();
    await card.getByRole("button", { name: "Save" }).click();
    await expect(card.getByText("Saved", { exact: true })).toBeVisible();
    await card.locator("summary", { hasText: "Open / closed status" }).click();
    await card.getByRole("combobox", { name: "Open / closed status" }).selectOption("closed");
    await card.getByRole("button", { name: "Save" }).nth(1).click();
    await expect(card.getByTestId("branch-open-state")).toHaveText("Closed now");
    await shot(page, "p3-04-branches");
  });

  test("menu: category and item in two languages, a photo, sold out", async ({ page }) => {
    await login(page);
    await page.goto(`${base}/menu`);
    await expect(page.getByTestId("menu-empty")).toBeVisible();
    await page.getByLabel("Category name (English)").fill("Breakfast");
    await page.getByLabel("Category name (Arabic)").fill("الفطور");
    await page.getByRole("button", { name: "Add category" }).click();
    const category = page.getByTestId("menu-category").first();
    await expect(category.getByRole("heading", { name: "Breakfast" })).toBeVisible();

    await category.getByTestId("add-item-toggle").click();
    await category.getByLabel("Name (English)", { exact: true }).fill("Shakshuka");
    await category.getByLabel("Name (Arabic)", { exact: true }).fill("شكشوكة");
    await category.getByLabel("Price (OMR)").fill("2.5");
    await category.getByRole("button", { name: "Add item" }).click();
    await page.waitForURL(/\/menu\/items\//);
    await page.getByRole("checkbox", { name: "Eggs" }).check();
    await page.getByRole("checkbox", { name: "Vegetarian" }).check();
    await page.getByRole("button", { name: "Save", exact: true }).first().click();
    await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible();

    await page.getByTestId("item-media-input").setInputFiles({ name: "dish.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByTestId("item-media")).toHaveCount(1);
    await expect(page.getByTestId("item-media").getByText("Cover")).toBeVisible();
    await shot(page, "p3-05-item");

    await page.goto(`${base}/menu`);
    const item = page.getByTestId("menu-item").filter({ hasText: "Shakshuka" });
    await expect(item).toContainText("OMR");
    await item.getByTestId("toggle-available").click();
    await expect(item.getByText("Sold out")).toBeVisible();
  });

  test("AI import with review, then AI translation drafts", async ({ page }) => {
    await login(page);
    await page.goto(`${base}/menu/import`);
    await page.getByTestId("import-file").setInputFiles({ name: "menu.png", mimeType: "image/png", buffer: PNG });
    await page.getByTestId("import-start").click();
    await page.waitForURL(/\/menu\/import\/[0-9a-f-]+$/);
    await expect(page.getByTestId("job-status")).toHaveText("Ready to review");
    await expect(page.getByTestId("import-item")).toHaveCount(3);
    await shot(page, "p3-06-import-review");
    // Untick one item and fix a price before publishing.
    await page.getByTestId("import-item").nth(1).getByRole("checkbox").uncheck();
    await page.getByTestId("import-item").nth(2).getByLabel("Price (OMR)").fill("3.900");
    await page.getByTestId("import-publish").click();
    await page.waitForURL(`**${base}/menu`);
    await expect(page.getByTestId("menu-item").filter({ hasText: "Hummus" })).toBeVisible();
    await expect(page.getByTestId("menu-item").filter({ hasText: "Lentil soup" })).toHaveCount(0);
    await expect(page.getByTestId("menu-item").filter({ hasText: "Chicken shawarma plate" })).toContainText("3.900");

    await page.goto(`${base}/menu/import`);
    await expect(page.getByTestId("ai-balance")).toContainText("AI credits: 97");

    await page.goto(`${base}/menu/translations`);
    await page.getByTestId("translate-start").click();
    await expect(page.getByText(/items translated/)).toBeVisible();
    await expect(page.getByTestId("translation-draft").first()).toBeVisible();
    const drafts = await page.getByTestId("translation-draft").count();
    await shot(page, "p3-07-translations");
    await page.getByTestId("translation-draft").first().getByRole("button", { name: "Mark reviewed" }).click();
    await expect(page.getByTestId("translation-draft")).toHaveCount(drafts - 1);
  });

  test("website: settings, and a custom domain from DNS required to main address", async ({ page }) => {
    await login(page);
    await page.goto(`${base}/website`);
    await page.getByLabel("Menu style").selectOption("grid");
    await page.getByRole("checkbox", { name: "Website published" }).check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible();

    const host = `www.${slug}-test.com`;
    await page.getByLabel("Domain (e.g. www.myrestaurant.com)").fill(host);
    await page.getByRole("button", { name: "Add domain" }).click();
    const row = page.getByTestId("domain-row").filter({ hasText: host });
    await expect(row.getByTestId("domain-status")).toHaveText("DNS required");
    await expect(row).toContainText("cname.vercel-dns.com");
    await shot(page, "p3-08-domain-dns");
    await row.getByTestId("domain-check").click();
    await expect(row.getByTestId("domain-status")).toHaveText("Active");
    await row.getByTestId("domain-primary").click();
    await expect(row.getByText("Main address")).toBeVisible();
    await shot(page, "p3-09-website");
  });

  test("log out of all devices ends every session", async ({ page }) => {
    await login(page);
    await page.goto("/account");
    await page.getByRole("button", { name: "Log out of all devices" }).click();
    await page.waitForURL("**/login**");
    const blocked = await page.request.get(base, { maxRedirects: 0 });
    expect([303, 307, 308]).toContain(blocked.status());
  });
});
