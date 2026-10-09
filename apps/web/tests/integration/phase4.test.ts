import { beforeAll, describe, expect, it } from "vitest";
import { anonClient, type Client, db, platformStaff, randomPhone, registerOwner, signInWithPhone } from "./helpers";

const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" });

/** A published restaurant (trial = Gold) with one category and one item. */
async function publishedRestaurant(name: string) {
  const owner = await registerOwner(name);
  const { data: cat } = await owner.client.from("menu_categories")
    .insert({ restaurant_id: owner.restaurantId, name: { en: "Mains" } }).select("id").single();
  const { data: item } = await owner.client.from("menu_items")
    .insert({ restaurant_id: owner.restaurantId, category_id: cat!.id, name: { en: "Shuwa" }, price_minor: 4500 }).select("id").single();
  const { error } = await owner.client.from("website_settings").update({ is_published: true }).eq("restaurant_id", owner.restaurantId);
  if (error) throw error;
  return { ...owner, itemId: item!.id as string };
}

describe("Phase 4: visitors see only the published website, through one function", () => {
  let a: Awaited<ReturnType<typeof publishedRestaurant>>;
  beforeAll(async () => {
    a = await publishedRestaurant("SiteA");
  });

  it("visitors read the website through public_site, never the tables", async () => {
    const visitor = anonClient();
    const { data } = await visitor.rpc("public_site", { p_restaurant_id: a.restaurantId });
    const site = data as { status: string; items: { name: Record<string, string> }[] };
    expect(site.status).toBe("ok");
    expect(site.items.map((i) => i.name.en)).toEqual(["Shuwa"]);
    for (const table of ["menu_items", "restaurants", "promotions", "frames", "qr_codes", "website_settings", "analytics_events"] as const) {
      const { data: rows, error } = await visitor.from(table as "menu_items").select("*").limit(1);
      expect(rows ?? [], table).toEqual([]);
      expect(error?.code ?? "42501", table).toBe("42501");
    }
  });

  it("an unpublished website is not public, but staff can preview it", async () => {
    await a.client.from("website_settings").update({ is_published: false }).eq("restaurant_id", a.restaurantId);
    expect((await anonClient().rpc("public_site", { p_restaurant_id: a.restaurantId })).data).toBeNull();
    const preview = await a.client.rpc("preview_site", { p_restaurant_id: a.restaurantId, p_template: "magazine" });
    expect((preview.data as { website: { template: string } }).website.template).toBe("magazine");
    expect((await anonClient().rpc("preview_site", { p_restaurant_id: a.restaurantId })).error?.code).toBe("42501");
    await a.client.from("website_settings").update({ is_published: true }).eq("restaurant_id", a.restaurantId);
  });

  it("the template catalogue is public; restaurants see what they can use", async () => {
    const { data: all } = await anonClient().rpc("list_templates");
    expect((all as unknown[]).length).toBe(9);
    const { data: mine } = await a.client.rpc("list_templates", { p_restaurant_id: a.restaurantId });
    const usable = (mine as { key: string; usable: boolean }[]).filter((t) => t.usable).map((t) => t.key);
    expect(usable).toEqual(["classic", "minimal", "cards", "showcase", "bold", "street"]); // Gold trial, nothing bought
  });
});

describe("Phase 4: a paid template unlocks when Finance records the payment", () => {
  it("buy → invoice → payment → usable → shown publicly", async () => {
    const owner = await publishedRestaurant("TplBuyer");
    const finance = await platformStaff("finance");
    const before = await owner.client.from("website_settings").update({ template_key: "cafe" }).eq("restaurant_id", owner.restaurantId);
    expect(before.error?.code).toBe("23514");

    const { data: invoiceId, error } = await owner.client.rpc("buy_template", { p_restaurant_id: owner.restaurantId, p_template_key: "cafe" });
    expect(error).toBeNull();
    const { rows } = await db.query("select total_minor, kind from public.billing_invoices where id = $1", [invoiceId]);
    expect(rows[0]).toMatchObject({ kind: "template", total_minor: "4900" });

    const paid = await finance.aal2.rpc("platform_record_payment", {
      p_invoice_id: invoiceId as string, p_amount_minor: 4900, p_method: "bank_transfer", p_reference: `TPL-${String(invoiceId).slice(0, 8)}`,
    });
    expect(paid.error).toBeNull();
    const after = await owner.client.from("website_settings").update({ template_key: "cafe" }).eq("restaurant_id", owner.restaurantId).select("template_key");
    expect(after.data).toEqual([{ template_key: "cafe" }]);
    const site = await anonClient().rpc("public_site", { p_restaurant_id: owner.restaurantId });
    expect((site.data as { website: { template: string } }).website.template).toBe("cafe");
  });
});

describe("Phase 4: QR codes, events and storage", () => {
  let a: Awaited<ReturnType<typeof publishedRestaurant>>;
  let b: Awaited<ReturnType<typeof publishedRestaurant>>;
  beforeAll(async () => {
    a = await publishedRestaurant("QrA");
    b = await publishedRestaurant("QrB");
  });

  it("table QR: scan → context; regenerate → old code dead; B cannot touch A's tables", async () => {
    const { data: branch } = await a.client.from("branches").select("id").eq("restaurant_id", a.restaurantId).single();
    const { data: tableId, error } = await a.client.rpc("create_table", { p_branch_id: branch!.id, p_label: "T7" });
    expect(error).toBeNull();
    const { data: code } = await a.client.from("qr_codes").select("token").eq("table_id", tableId as string).single();
    const scan = await anonClient().rpc("resolve_qr", { p_token: code!.token });
    expect(scan.data).toMatchObject({ restaurant_id: a.restaurantId, table_label: "T7", kind: "table" });

    expect((await b.client.rpc("regenerate_table_qr", { p_table_id: tableId as string })).error?.code).toBe("42501");
    expect((await b.client.from("qr_codes").select("token").eq("table_id", tableId as string)).data).toEqual([]);

    await a.client.rpc("regenerate_table_qr", { p_table_id: tableId as string });
    expect((await anonClient().rpc("resolve_qr", { p_token: code!.token })).data).toBeNull();
  });

  it("events: visitors are counted, staff are flagged internal, owners read only their own", async () => {
    const session = `it${Date.now().toString(36)}abcdef`;
    await anonClient().rpc("track_event", { p_restaurant_id: a.restaurantId, p_event_type: "go_click", p_session_id: session });
    await a.client.rpc("track_event", { p_restaurant_id: a.restaurantId, p_event_type: "website_view", p_session_id: `${session}x` });
    const { data: mine } = await a.client.from("analytics_events").select("event_type, is_internal").in("session_id", [session, `${session}x`]);
    expect(mine).toEqual(expect.arrayContaining([
      { event_type: "go_click", is_internal: false }, { event_type: "website_view", is_internal: true },
    ]));
    expect((await b.client.from("analytics_events").select("id").eq("restaurant_id", a.restaurantId)).data).toEqual([]);
  });

  it("promotion and Frame media can only be uploaded into your own restaurant's folders", async () => {
    const own = await a.client.storage.from("restaurant-public").upload(`${a.restaurantId}/promotions/${crypto.randomUUID()}.png`, png);
    expect(own.error).toBeNull();
    const ownFrame = await a.client.storage.from("restaurant-public").upload(`${a.restaurantId}/frames/${crypto.randomUUID()}.png`, png);
    expect(ownFrame.error).toBeNull();
    const theirs = await a.client.storage.from("restaurant-public").upload(`${b.restaurantId}/frames/${crypto.randomUUID()}.png`, png);
    expect(theirs.error).not.toBeNull();
  });
});

describe("Phase 4: diner account", () => {
  let site: Awaited<ReturnType<typeof publishedRestaurant>>;
  let diner: Client;
  beforeAll(async () => {
    site = await publishedRestaurant("Diner");
    diner = await signInWithPhone(randomPhone(), "Diner Person");
  });

  it("a diner (no membership anywhere) saves favorites; nobody else can read them", async () => {
    const { data: me } = await diner.auth.getUser();
    const fav = await diner.from("diner_favorites").insert({ user_id: me.user!.id, restaurant_id: site.restaurantId, item_id: site.itemId });
    expect(fav.error).toBeNull();
    const { data: list } = await diner.rpc("my_favorites");
    expect((list as { item_name: Record<string, string> }[])[0].item_name).toEqual({ en: "Shuwa" });

    expect((await site.client.from("diner_favorites").select("id")).data).toEqual([]);
    const other = await signInWithPhone(randomPhone());
    expect((await other.from("diner_favorites").select("id")).data).toEqual([]);
    const spoof = await other.from("diner_favorites").insert({ user_id: me.user!.id, restaurant_id: site.restaurantId });
    expect(spoof.error?.code).toBe("42501");
  });

  it("a diner gets nothing from the restaurant: no menu tables, no staff data", async () => {
    for (const table of ["menu_items", "memberships", "restaurants", "analytics_events", "promotions"] as const) {
      const { data } = await diner.from(table as "menu_items").select("id");
      expect(data ?? [], table).toEqual([]);
    }
  });

  it("privacy: deleting diner data removes favorites", async () => {
    await diner.rpc("delete_my_diner_data");
    expect((await diner.from("diner_favorites").select("id")).data).toEqual([]);
  });
});
