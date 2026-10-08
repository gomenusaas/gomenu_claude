import { beforeAll, describe, expect, it } from "vitest";
import { fakeProvider } from "../../lib/ai/fake";
import { toImportPayload, TranslationSet } from "../../lib/ai/provider";
import { syncDomain } from "../../lib/domains/sync";
import { isoToZonedLocal, minorToInput, toMinor, zonedLocalToIso } from "../../lib/format";
import { markEdited, unreviewed } from "../../lib/i18n/text";
import { anonClient, type Client, db, newStaff, registerOwner, serviceClient } from "./helpers";

const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" });

describe("Phase 3: storage paths are tenant-scoped", () => {
  let a: { client: Client; restaurantId: string };
  let b: { client: Client; restaurantId: string };
  let fresh: Client;

  beforeAll(async () => {
    a = await registerOwner("StoreA");
    b = await registerOwner("StoreB");
    fresh = (await newStaff(a)).client;
  });

  it("an owner uploads menu media and import files into their own restaurant", async () => {
    const pub = await a.client.storage.from("restaurant-public").upload(`${a.restaurantId}/menu/x/${crypto.randomUUID()}.png`, png);
    expect(pub.error).toBeNull();
    const priv = await a.client.storage.from("restaurant-private").upload(`${a.restaurantId}/imports/${crypto.randomUUID()}.png`, png);
    expect(priv.error).toBeNull();
  });

  it("Restaurant A cannot write into Restaurant B's folders", async () => {
    const pub = await a.client.storage.from("restaurant-public").upload(`${b.restaurantId}/menu/x/${crypto.randomUUID()}.png`, png);
    expect(pub.error).not.toBeNull();
    const priv = await a.client.storage.from("restaurant-private").upload(`${b.restaurantId}/imports/${crypto.randomUUID()}.png`, png);
    expect(priv.error).not.toBeNull();
  });

  it("Restaurant A cannot read Restaurant B's private import files", async () => {
    const path = `${b.restaurantId}/imports/${crypto.randomUUID()}.png`;
    expect((await b.client.storage.from("restaurant-private").upload(path, png)).error).toBeNull();
    const { data } = await a.client.storage.from("restaurant-private").download(path);
    expect(data).toBeNull();
    const listed = await a.client.storage.from("restaurant-private").list(`${b.restaurantId}/imports`);
    expect(listed.data ?? []).toHaveLength(0);
  });

  it("New Staff cannot upload anything, even into their own restaurant", async () => {
    const pub = await fresh.storage.from("restaurant-public").upload(`${a.restaurantId}/menu/x/${crypto.randomUUID()}.png`, png);
    expect(pub.error).not.toBeNull();
    const priv = await fresh.storage.from("restaurant-private").upload(`${a.restaurantId}/imports/${crypto.randomUUID()}.png`, png);
    expect(priv.error).not.toBeNull();
  });

  it("New Staff sees no menu, AI jobs, credits, domains or website settings", async () => {
    for (const table of ["menu_items", "menu_categories", "ai_jobs", "ai_credit_ledger", "restaurant_domains", "website_settings",
      "gallery_media", "branch_hours", "user_devices"] as const) {
      const { data } = await fresh.from(table as "menu_items").select("*");
      if (table === "user_devices") continue; // their own device rows only
      expect(data ?? [], table).toHaveLength(0);
    }
    const dash = await fresh.rpc("restaurant_dashboard", { p_restaurant_id: a.restaurantId });
    expect(dash.error?.code).toBe("42501");
  });
});

describe("Phase 3: server-only RPCs are not callable from browsers", () => {
  let owner: { client: Client; restaurantId: string };
  beforeAll(async () => {
    owner = await registerOwner("ServerOnly");
  });

  it.each([
    ["complete_menu_import", { p_job_id: crypto.randomUUID(), p_result: {} }],
    ["complete_translation", { p_job_id: crypto.randomUUID(), p_translated: {} }],
    ["fail_ai_job", { p_job_id: crypto.randomUUID(), p_error: "x" }],
    ["set_domain_status", { p_domain_id: crypto.randomUUID(), p_status: "active" }],
    ["pin_unlock", { p_user_id: crypto.randomUUID(), p_device_token: "x", p_pin: "123456" }],
    ["park_device_session", { p_user_id: crypto.randomUUID(), p_device_token: "x", p_ciphertext: "x" }],
  ])("%s is denied to signed-in users and anonymous visitors", async (fn, args) => {
    for (const client of [owner.client, anonClient()]) {
      const { error } = await client.rpc(fn as never, args as never);
      expect(error?.code, fn).toBe("42501"); // permission denied, not merely "function not found"
    }
  });
});

describe("Phase 3: AI menu import and translation (fake provider)", () => {
  let owner: { client: Client; restaurantId: string };
  const admin = serviceClient();

  beforeAll(async () => {
    owner = await registerOwner("AiFlow");
    const { error } = await owner.client.rpc("set_restaurant_languages", { p_restaurant_id: owner.restaurantId, p_locales: ["en", "ar"] });
    if (error) throw error;
  });

  it("converts extracted prices to minor units of the restaurant currency", async () => {
    const extraction = await fakeProvider.extractMenu({ data: Buffer.from(""), mediaType: "application/pdf" }, { locale: "en", currency: "OMR" });
    const payload = toImportPayload(extraction, "OMR");
    expect(payload.categories.flatMap((c) => c.items.map((i) => i.price_minor))).toEqual([1500, 1200, 3500]);
    expect(toImportPayload(extraction, "USD").categories[0].items[0].price_minor).toBe(150);
  });

  it("import: start -> AI result -> credits charged per item -> review -> published menu", async () => {
    const before = (await owner.client.rpc("ai_credit_balance", { p_restaurant_id: owner.restaurantId })).data as number;
    const path = `${owner.restaurantId}/imports/${crypto.randomUUID()}.png`;
    expect((await owner.client.storage.from("restaurant-private").upload(path, png)).error).toBeNull();
    const started = await owner.client.rpc("start_menu_import", { p_restaurant_id: owner.restaurantId, p_source_path: path });
    expect(started.error).toBeNull();
    const jobId = started.data as string;

    const extraction = await fakeProvider.extractMenu({ data: Buffer.from(""), mediaType: "image/png" }, { locale: "en", currency: "OMR" });
    const done = await admin.rpc("complete_menu_import", { p_job_id: jobId, p_result: toImportPayload(extraction, "OMR") });
    expect(done.data).toBe("needs_review");
    const after = (await owner.client.rpc("ai_credit_balance", { p_restaurant_id: owner.restaurantId })).data as number;
    expect(before - after).toBe(3);

    const published = await owner.client.rpc("apply_menu_import", {
      p_job_id: jobId,
      p_payload: { categories: [{ name: "Starters", items: [{ name: "Hummus", description: null, price_minor: 1500 }] }] },
    });
    expect(published.data).toBe(1);
    const { data: items } = await owner.client.from("menu_items").select("name, price_minor").eq("restaurant_id", owner.restaurantId);
    expect(items).toEqual([{ name: { en: "Hummus" }, price_minor: 1500 }]);
  });

  it("translation: AI drafts are saved unreviewed, then a person marks them reviewed", async () => {
    const started = await owner.client.rpc("start_translation", {
      p_restaurant_id: owner.restaurantId, p_target_locale: "ar", p_scope: { type: "menu" },
    });
    expect(started.error).toBeNull();
    const job = started.data as { job_id: string; source: unknown; item_count: number };
    expect(job.item_count).toBe(1);
    const source = TranslationSet.parse({
      variants: [], option_groups: [], options: [], ...(job.source as object),
      items: (job.source as { items: { id: string; name: string; description: string | null }[] }).items
        .map((i) => ({ ...i, description: i.description ?? null })),
    });
    const translated = await fakeProvider.translate(source, { from: "en", to: "ar", restaurantName: "x" });
    const done = await admin.rpc("complete_translation", { p_job_id: job.job_id, p_translated: translated });
    expect(done.data).toBe("completed");

    const { data: item } = await owner.client.from("menu_items").select("id, name, i18n_meta").eq("restaurant_id", owner.restaurantId).single();
    expect((item!.name as Record<string, string>).ar).toBe("Hummus [ar]");
    expect(unreviewed(item!.i18n_meta)).toEqual(["ar"]);

    const reviewed = await owner.client.rpc("mark_translation_reviewed", { p_entity: "menu_items", p_id: item!.id, p_locale: "ar" });
    expect(reviewed.error).toBeNull();
    const { data: again } = await owner.client.from("menu_items").select("i18n_meta").eq("id", item!.id).single();
    expect(unreviewed(again!.i18n_meta)).toEqual([]);
  });

  it("editing a draft's text counts as reviewing it; untouched drafts stay drafts", () => {
    const meta = { ar: { source: "ai", reviewed: false }, fr: { source: "ai", reviewed: false } };
    const result = markEdited(meta, { ar: "old", fr: "same" }, { ar: "new", fr: "same" });
    expect(unreviewed(result)).toEqual(["fr"]);
  });
});

describe("Phase 3: custom domains (stand-in provider)", () => {
  it("add -> DNS required -> check -> active -> resolves publicly", async () => {
    const owner = await registerOwner("Domains"); // trial = Gold, which includes custom domains
    const hostname = `www.${Math.random().toString(36).slice(2, 10)}-test.com`;
    const added = await owner.client.rpc("add_custom_domain", { p_restaurant_id: owner.restaurantId, p_hostname: hostname });
    expect(added.error).toBeNull();
    const domain = { id: added.data as string, hostname };

    expect((await syncDomain(domain, "add")).status).toBe("dns_required");
    const { data: row } = await owner.client.from("restaurant_domains").select("status, verification").eq("id", domain.id).single();
    expect(row!.status).toBe("dns_required");
    expect(row!.verification).toEqual([{ type: "CNAME", name: "www", value: "cname.vercel-dns.com" }]);

    expect((await syncDomain(domain)).status).toBe("active");
    const resolved = await anonClient().rpc("resolve_host", { p_hostname: hostname.toUpperCase() });
    expect((resolved.data as { restaurant_id: string }).restaurant_id).toBe(owner.restaurantId);
  });

  it("a domain can belong to only one restaurant", async () => {
    const a = await registerOwner("DomA");
    const b = await registerOwner("DomB");
    const hostname = `${Math.random().toString(36).slice(2, 10)}-test.com`;
    expect((await a.client.rpc("add_custom_domain", { p_restaurant_id: a.restaurantId, p_hostname: hostname })).error).toBeNull();
    const second = await b.client.rpc("add_custom_domain", { p_restaurant_id: b.restaurantId, p_hostname: hostname });
    expect(second.error?.code).toBe("23505");
    // ...and B cannot see A's domain row.
    const { data } = await b.client.from("restaurant_domains").select("id").eq("hostname", hostname);
    expect(data).toEqual([]);
  });
});

describe("Phase 3: helpers", () => {
  it("money input round-trips in minor units (OMR has 3 decimals)", () => {
    expect(toMinor("1.5", "OMR")).toBe(1500);
    expect(toMinor("1,250", "OMR")).toBe(1250);
    expect(toMinor("-1", "OMR")).toBeNull();
    expect(toMinor("abc", "USD")).toBeNull();
    expect(minorToInput(1500, "OMR")).toBe("1.500");
    expect(minorToInput(150, "USD")).toBe("1.50");
  });

  it("manual open/closed 'until' times use the restaurant's time zone", () => {
    expect(zonedLocalToIso("2026-10-08T23:30", "Asia/Muscat")).toBe("2026-10-08T19:30:00.000Z");
    expect(isoToZonedLocal("2026-10-08T19:30:00.000Z", "Asia/Muscat")).toBe("2026-10-08T23:30");
  });
});

describe("Phase 3: the AI provider record is not exposed", () => {
  it("ai_jobs results are visible only inside the restaurant", async () => {
    const { rows } = await db.query("select count(*)::int as n from public.ai_jobs");
    expect(rows[0].n).toBeGreaterThan(0);
    const stranger = await registerOwner("Stranger");
    const { data } = await stranger.client.from("ai_jobs").select("id");
    expect(data).toEqual([]);
  });
});
