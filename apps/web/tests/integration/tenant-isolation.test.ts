import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, db, publicTables, registerOwner, tenantTables, type Client } from "./helpers";

// Restaurant A must never read or write Restaurant B's data — through the real API
// (PostgREST, Storage, Realtime) with real user sessions issued by Supabase Auth.
describe("tenant isolation over the API", () => {
  let a: { client: Client; restaurantId: string };
  let b: { client: Client; restaurantId: string };

  beforeAll(async () => {
    a = await registerOwner("Alpha");
    b = await registerOwner("Bravo");
    // Give B data in every tenant table: an invitation (memberships, staff_invitations,
    // audit_events) and a notification.
    const invited = await b.client.rpc("invite_staff", {
      p_restaurant_id: b.restaurantId,
      p_full_name: "Bravo Waiter",
      p_phone_e164: "+96891234000",
    });
    expect(invited.error).toBeNull();
    await db.query(
      `insert into public.restaurant_notifications (restaurant_id, kind, required_permission, title)
       values ($1, 'test', 'menu.view', 'B secret')`,
      [b.restaurantId],
    );
  });

  afterAll(async () => {
    await a.client.removeAllChannels();
  });

  it("B's owner can see B's rows (control: the checks below are not vacuous)", async () => {
    for (const { table, column } of await tenantTables()) {
      if (table.startsWith("platform_")) continue; // platform data is never tenant-visible
      const { rows } = await db.query(`select count(*)::int as n from public.${table} where ${column} = $1`, [b.restaurantId]);
      if (rows[0].n === 0) continue;
      const { data, error } = await b.client.from(table as "restaurants").select(column as "id").eq(column as "id", b.restaurantId);
      expect(error, table).toBeNull();
      expect(data!.length, `${table} control`).toBeGreaterThan(0);
    }
  });

  it("A cannot SELECT any of B's rows in any tenant table", async () => {
    for (const { table, column } of await tenantTables()) {
      const { data } = await a.client.from(table as "restaurants").select(column as "id").eq(column as "id", b.restaurantId);
      expect(data ?? [], table).toEqual([]);
    }
  });

  it("A sees exactly one restaurant: its own", async () => {
    const { data } = await a.client.from("restaurants").select("id");
    expect(data).toEqual([{ id: a.restaurantId }]);
  });

  it("A cannot write into B", async () => {
    const insert = await a.client.from("branches").insert({ restaurant_id: b.restaurantId, name: "Injected" });
    expect(insert.error?.code).toBe("42501");

    const update = await a.client.from("restaurants").update({ name: "Hacked" }).eq("id", b.restaurantId).select();
    expect(update.data ?? []).toEqual([]);
    const { rows } = await db.query("select name from public.restaurants where id = $1", [b.restaurantId]);
    expect(rows[0].name).toBe("Bravo Restaurant");

    const invite = await a.client.rpc("invite_staff", {
      p_restaurant_id: b.restaurantId,
      p_full_name: "Spy",
      p_phone_e164: "+96891234001",
    });
    expect(invite.error?.code).toBe("42501");
  });

  it("Storage: A cannot list, read or upload B's files", async () => {
    const path = `${b.restaurantId}/private-doc.txt`;
    const up = await b.client.storage.from("restaurant-private").upload(path, new Blob(["B only"]), { contentType: "text/plain" });
    expect(up.error).toBeNull();

    const list = await a.client.storage.from("restaurant-private").list(b.restaurantId);
    expect(list.data ?? []).toEqual([]);
    const download = await a.client.storage.from("restaurant-private").download(path);
    expect(download.data).toBeNull();
    const intrude = await a.client.storage
      .from("restaurant-public")
      .upload(`${b.restaurantId}/defaced.png`, new Blob(["x"]), { contentType: "image/png" });
    expect(intrude.error).not.toBeNull();

    // control: B can read it back
    const own = await b.client.storage.from("restaurant-private").download(path);
    expect(await own.data!.text()).toBe("B only");
  });

  it("Realtime: A receives its own changes but never B's", async () => {
    const received: string[] = [];
    await new Promise<void>((resolve, reject) => {
      a.client
        .channel("a-notifications")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "restaurant_notifications" }, (p) =>
          received.push((p.new as { title: string }).title),
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") resolve();
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error(status));
        });
    });
    const insert = (restaurantId: string, title: string) =>
      db.query(
        `insert into public.restaurant_notifications (restaurant_id, kind, required_permission, title)
         values ($1, 'test', 'menu.view', $2)`,
        [restaurantId, title],
      );
    const waitFor = async (title: string, ms: number) => {
      const deadline = Date.now() + ms;
      while (!received.includes(title) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
      return received.includes(title);
    };

    // postgres_changes needs a moment after SUBSCRIBED: warm up until A's own event arrives.
    for (let i = 0; i < 20 && !(await waitFor(`warmup-${i - 1}`, 1000)); i++) {
      await insert(a.restaurantId, `warmup-${i}`);
    }

    await insert(b.restaurantId, "for B");
    await insert(a.restaurantId, "for A");
    await waitFor("for A", 10_000);
    await new Promise((r) => setTimeout(r, 1500)); // give a stray B event time to (not) arrive

    expect(received).toContain("for A");
    expect(received).not.toContain("for B");
  });

  it("Realtime broadcast: A cannot join B's private channel", async () => {
    await a.client.realtime.setAuth();
    const status = await new Promise<string>((resolve) => {
      a.client
        .channel(`restaurant:${b.restaurantId}`, { config: { private: true } })
        .subscribe((s) => {
          if (s !== "SUBSCRIBED" && s !== "CHANNEL_ERROR" && s !== "TIMED_OUT") return;
          resolve(s);
        });
    });
    expect(status).not.toBe("SUBSCRIBED");
  });

  it("signed-out visitors read nothing from any table", async () => {
    const anon = anonClient();
    for (const table of await publicTables()) {
      const { data } = await anon.from(table as "restaurants").select("*");
      expect(data ?? [], table).toEqual([]);
    }
  });
});
