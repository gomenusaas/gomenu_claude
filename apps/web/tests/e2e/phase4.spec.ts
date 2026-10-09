import { expect, test, type Page } from "@playwright/test";
import pg from "pg";

// Phase 4 end to end: the public website (seeded demo restaurant), QR codes, the diner account,
// and an owner setting up templates, offers, Frames and tables. Screenshots: test-results/screens/.
const db = new pg.Pool({
  connectionString: process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 2,
});

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==",
  "base64",
);
const DEMO = "/demo-muscat-grill";

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

/** Mobile + code sign-in; `start` is the page that asks for it. */
async function otp(page: Page, phone: string) {
  await page.waitForTimeout(1500); // GoTrue: one code per number per second locally
  const since = await dbNow();
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Verification code").fill((await latest(phone, "auth_otp", since)).otp);
  await page.getByRole("button", { name: "Verify" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/verify"));
}

test.describe.serial("Phase 4: customer experience", () => {
  test.afterAll(async () => db.end());

  test("visitor: website in English and Arabic, menu, item page, GO with branch choice", async ({ page }) => {
    await page.goto(DEMO);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Muscat Grill (Demo)");
    await expect(page.locator("[data-template]").first()).toHaveAttribute("data-template", "showcase");
    await expect(page.getByTestId("site-item")).toHaveCount(5);
    await expect(page.getByTestId("promotion")).toHaveCount(1);
    await shot(page, "p4-01-site-en");

    await page.getByTestId("go-button").click();               // two branches → choose one
    await expect(page.getByTestId("go-branch")).toHaveCount(2);
    await page.getByRole("button", { name: "Close" }).click();

    await page.getByRole("link", { name: "العربية" }).first().click();
    await expect(page.locator("[data-template]").first()).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "المقبلات" })).toBeVisible();
    await shot(page, "p4-02-site-ar");

    await page.getByTestId("site-item").filter({ hasText: "حمص" }).getByRole("link").click();
    await expect(page.getByTestId("item-name")).toHaveText("حمص");
    await expect(page.getByTestId("item-allergens")).toContainText("السمسم");
    await expect(page).toHaveURL(/\/item\/.+lang=ar/);
    await shot(page, "p4-03-item-ar");

    const { rows } = await db.query(
      `select count(*)::int as n from public.analytics_events
        where restaurant_id = 'd0000000-0000-4000-8000-000000000001' and event_type in ('website_view', 'item_view') and not is_internal`);
    expect(rows[0].n).toBeGreaterThan(0);
  });

  test("table QR: scanning lands on the website with the table's context", async ({ page }) => {
    await page.goto("/q/demo-muscat-grill-table-t2");
    await expect(page).toHaveURL(/\/demo-muscat-grill\?branch=/);
    await expect(page.getByTestId("table-banner")).toContainText("T2");
    await shot(page, "p4-04-table-qr");
    const dead = await page.request.get("/q/this-token-was-never-issued-x");
    expect(dead.status()).toBe(404);
  });

  test("diner: favorite → sign in with a code → back on the dish → account and privacy", async ({ page }) => {
    const phone = `+9689${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
    await page.goto(DEMO);
    await page.getByTestId("site-item").filter({ hasText: "Mixed grill" }).getByRole("link").click();
    // The restaurant page has its own favorite button: be on the dish before pressing it.
    await expect(page.getByTestId("item-name")).toHaveText("Mixed grill");
    await page.getByTestId("favorite-button").click();
    await page.waitForURL(/\/me\/login/);
    await otp(page, phone);
    await expect(page.getByTestId("item-name")).toHaveText("Mixed grill");
    await page.getByTestId("favorite-button").click();
    await expect(page.getByTestId("favorite-button")).toHaveAttribute("aria-pressed", "true");

    await page.goto("/me");
    await expect(page.getByTestId("my-favorite")).toContainText("Mixed grill · Muscat Grill (Demo)");
    await shot(page, "p4-05-diner-account");
    await page.getByRole("button", { name: "Delete my favorites and preferences" }).click();
    await expect(page.getByText("Your data was deleted.")).toBeVisible();
    await expect(page.getByTestId("my-favorite")).toHaveCount(0);
  });

  test("owner: publish, offer, Frame, template, tables and QR", async ({ page }) => {
    const phone = `+9689${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
    const slug = `p4-${Date.now().toString(36)}`;
    await page.goto("/register");
    await page.getByLabel("Your name").fill("Rami Owner");
    await otp(page, phone);
    await page.getByLabel("Restaurant name").fill(`Phase Four Diner ${slug}`);
    await page.getByLabel("Web address").fill(slug);
    await page.getByLabel("I accept the Terms of Service").check();
    await page.getByRole("button", { name: "Create restaurant" }).click();
    await page.waitForURL(/\/r\/[0-9a-f-]+\/setup$/);
    const base = new URL(page.url()).pathname.replace(/\/setup$/, "");

    // A dish to show.
    await page.goto(`${base}/menu`);
    await page.getByLabel("Category name (English)").fill("Burgers");
    await page.getByRole("button", { name: "Add category" }).click();
    await page.getByTestId("add-item-toggle").click();
    await page.getByLabel("Name (English)", { exact: true }).fill("Smash burger");
    await page.getByLabel("Price (OMR)").fill("2.9");
    await page.getByRole("button", { name: "Add item" }).click();
    await page.waitForURL(/\/menu\/items\//);

    // Template + publish.
    await page.goto(`${base}/website`);
    await page.getByTestId("template-bold").getByTestId("use-template").click();
    await expect(page.getByTestId("template-bold").getByText("Current")).toBeVisible();
    await page.getByTestId("template-elegant").getByTestId("buy-template").click();
    await expect(page.getByTestId("template-elegant").getByText("Waiting for payment")).toBeVisible();
    await page.getByRole("checkbox", { name: "Website published" }).check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible();
    await shot(page, "p4-06-templates");

    // Offer linked to the dish.
    await page.goto(`${base}/promotions`);
    await page.getByLabel("Title (English)").first().fill("Burger Tuesday");
    await page.getByLabel("Link to a dish (optional)").first().selectOption({ label: "Smash burger" });
    await page.getByRole("button", { name: "New promotion" }).click();
    await expect(page.getByTestId("promotion-row")).toHaveCount(1);
    await expect(page.getByTestId("promotion-status")).toHaveText("Showing");

    // Frame.
    await page.goto(`${base}/frames`);
    await page.getByTestId("frame-file").setInputFiles({ name: "today.png", mimeType: "image/png", buffer: PNG });
    await page.getByLabel("Caption (English)").fill("Fresh off the grill");
    await page.getByTestId("frame-publish").click();
    await expect(page.getByTestId("frame-row")).toHaveCount(1);
    await expect(page.getByTestId("frame-status")).toHaveText("Live");

    // Tables and QR: regenerating kills the old code.
    await page.goto(`${base}/qr`);
    await page.getByLabel("Table name or number").fill("A1");
    await page.getByRole("button", { name: "Add table" }).click();
    await expect(page.getByTestId("table-row")).toHaveCount(1);
    const { rows: before } = await db.query(
      `select q.token from public.qr_codes q join public.restaurants r on r.id = q.restaurant_id
        where r.slug = $1 and q.kind = 'table' and q.revoked_at is null`, [slug]);
    expect((await page.request.get(`/q/${before[0].token}`, { maxRedirects: 0 })).status()).toBe(307);
    await page.getByTestId("qr-regenerate").click();
    await expect.poll(async () => (await page.request.get(`/q/${before[0].token}`, { maxRedirects: 0 })).status()).toBe(404);
    await page.reload(); // the page now lists the new code; the old one is revoked
    const png = await page.request.get(await page.getByTestId("qr-download").first().getAttribute("href") as string);
    expect(png.status()).toBe(200);
    expect(png.headers()["content-type"]).toBe("image/png");
    await shot(page, "p4-07-qr");

    // The public website shows it all, in the chosen template.
    await page.goto(`/${slug}`);
    await expect(page.locator("[data-template]").first()).toHaveAttribute("data-template", "bold");
    await expect(page.getByTestId("promotion")).toContainText("Burger Tuesday");
    await page.getByTestId("frame-thumb").first().click();
    await expect(page.getByTestId("frame-viewer")).toContainText("Fresh off the grill");
    await page.getByRole("button", { name: "Close" }).click();
    await shot(page, "p4-08-owner-site");

    // Preview of a template it doesn't own yet, with its own content.
    await page.goto(`/preview/${base.split("/").pop()}?template=magazine`);
    await expect(page.getByTestId("preview-banner")).toBeVisible();
    await expect(page.locator("[data-template]").first()).toHaveAttribute("data-template", "magazine");
  });

  test("custom domain: the domain serves the restaurant's site", async ({ page }) => {
    const host = `www.${Date.now().toString(36)}-e2e.test`;
    await db.query(
      `insert into public.restaurant_domains (restaurant_id, hostname, kind, status)
       values ('d0000000-0000-4000-8000-000000000001', $1, 'www', 'active')`, [host]);
    const res = await page.request.get("/", { headers: { host } });
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain("Muscat Grill (Demo)");
    expect(html).toContain('data-template="showcase"');
    const unknown = await page.request.get("/", { headers: { host: "not-connected.example" } });
    expect(unknown.status()).toBe(404);
    await db.query("delete from public.restaurant_domains where hostname = $1", [host]);
  });
});
