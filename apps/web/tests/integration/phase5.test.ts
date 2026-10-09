import { beforeAll, describe, expect, it } from "vitest";
import { anonClient, type Client, db, randomPhone, registerOwner, serviceClient, signInWithPhone } from "./helpers";

/** A published restaurant (trial = Gold) taking orders and online payments, branch open now. */
async function orderingRestaurant(name: string) {
  const owner = await registerOwner(name);
  const rid = owner.restaurantId;
  const { data: cat } = await owner.client.from("menu_categories").insert({ restaurant_id: rid, name: { en: "Mains" } }).select("id").single();
  const { data: item } = await owner.client.from("menu_items")
    .insert({ restaurant_id: rid, category_id: cat!.id, name: { en: "Shuwa" }, price_minor: 4500 }).select("id").single();
  await owner.client.from("website_settings").update({ is_published: true, ordering_enabled: true, online_payment_enabled: true }).eq("restaurant_id", rid);
  const { data: branch } = await owner.client.from("branches").select("id").eq("restaurant_id", rid).single();
  await db.query("update public.branches set status_override = 'open' where id = $1", [branch!.id]);
  return { ...owner, itemId: item!.id as string, branchId: branch!.id as string };
}

type Placed = { order_id: string; public_key: string; number: number };

async function pickup(r: Awaited<ReturnType<typeof orderingRestaurant>>, client: Client = anonClient()) {
  const { data, error } = await client.rpc("place_order", {
    p_restaurant_id: r.restaurantId,
    p_payload: { branch_id: r.branchId, service_type: "pickup", items: [{ item_id: r.itemId, quantity: 2, price_minor: 1 }] },
  });
  if (error) throw error;
  return data as unknown as Placed;
}

describe("Phase 5: orders are priced and stored by the database, read only by the right people", () => {
  let a: Awaited<ReturnType<typeof orderingRestaurant>>;
  let b: Awaited<ReturnType<typeof orderingRestaurant>>;
  let order: Placed;
  beforeAll(async () => {
    a = await orderingRestaurant("OrdA");
    b = await orderingRestaurant("OrdB");
    order = await pickup(a);
  });

  it("a guest orders; the price sent by the browser is ignored", async () => {
    const tracked = (await anonClient().rpc("track_order", { p_public_key: order.public_key })).data as { total_minor: number; status: string };
    expect(tracked).toMatchObject({ total_minor: 9000, status: "confirmed" });  // 2 × 4.500 from the menu
    const { data, error } = await anonClient().from("orders").select("id");
    expect(data ?? []).toEqual([]);
    expect(error?.code).toBe("42501");
  });

  it("the owner sees the order; restaurant B sees nothing and cannot act on it", async () => {
    expect((await a.client.from("orders").select("id").eq("id", order.order_id)).data).toHaveLength(1);
    for (const table of ["orders", "order_items", "order_events", "payments"] as const) {
      expect((await b.client.from(table as "orders").select("id").eq("restaurant_id", a.restaurantId)).data, table).toEqual([]);
    }
    expect((await b.client.rpc("cancel_order", { p_order_id: order.order_id, p_note: "x" })).error?.code).toBe("42501");
    expect((await b.client.rpc("record_offline_payment", { p_order_id: order.order_id, p_method: "cash" })).error?.code).toBe("42501");
  });

  it("New Staff have zero access to orders, payments and order actions", async () => {
    const phone = randomPhone();
    const person = await signInWithPhone(phone, "New Person");
    const { data: me } = await person.auth.getUser();
    await db.query(
      `insert into public.memberships (restaurant_id, user_id, role_id, status, branch_scope, invited_name, verified_at)
       select $1, $2, id, 'new_staff', 'selected', 'New Person', now() from public.roles where is_new_staff`,
      [a.restaurantId, me.user!.id]);
    for (const table of ["orders", "order_items", "order_events", "payments", "payment_refunds", "waiter_shifts", "payment_connections"] as const) {
      expect((await person.from(table as "orders").select("id")).data ?? [], table).toEqual([]);
    }
    expect((await person.rpc("confirm_order", { p_order_id: order.order_id })).error?.code).toBe("42501");
    expect((await person.rpc("set_shift", { p_branch_id: a.branchId, p_on: true })).error?.code).toBe("42501");
    expect((await person.rpc("branch_order_staff", { p_branch_id: a.branchId })).error?.code).toBe("42501");
  });

  it("a signed-in diner sees their own orders in their account, nobody else's", async () => {
    const diner = await signInWithPhone(randomPhone(), "Hungry Diner");
    const mine = await pickup(a, diner);
    const { data } = await diner.rpc("my_orders");
    expect((data as unknown as { public_key: string }[]).map((o) => o.public_key)).toEqual([mine.public_key]);
    expect((await diner.from("orders").select("id")).data?.map((o) => o.id)).toEqual([mine.order_id]);
  });
});

describe("Phase 5: online payments only through verified, idempotent webhooks; refunds", () => {
  let a: Awaited<ReturnType<typeof orderingRestaurant>>;
  beforeAll(async () => {
    a = await orderingRestaurant("PayA");
  });

  it("owner connects the test gateway (fresh OTP); payment succeeds once; refund updates the order", async () => {
    const connect = await a.client.rpc("connect_gateway", {
      p_restaurant_id: a.restaurantId, p_gateway_key: "test", p_public_config: { mode: "test" }, p_secret_ciphertext: "sealed-0123456789abcdef",
    });
    expect(connect.error).toBeNull();
    const order = await pickup(a);
    expect((await anonClient().rpc("start_online_payment", { p_public_key: order.public_key })).error?.code).toBe("42501");

    const server = serviceClient();
    const { data: started } = await server.rpc("start_online_payment", { p_public_key: order.public_key });
    const payment = started as { payment_id: string; amount_minor: number; gateway: string };
    expect(payment).toMatchObject({ amount_minor: 9000, gateway: "test" });
    const event = { id: `evt-${order.number}-${Date.now()}`, type: "payment.succeeded", payment_id: payment.payment_id, amount_minor: 9000, currency: "OMR" };
    expect((await server.rpc("apply_payment_event", { p_gateway_key: "test", p_event: event })).data).toBe("paid");
    expect((await server.rpc("apply_payment_event", { p_gateway_key: "test", p_event: event })).data).toBe("duplicate");
    const tracked = (await anonClient().rpc("track_order", { p_public_key: order.public_key })).data as { payment_status: string };
    expect(tracked.payment_status).toBe("paid");

    const refund = await a.client.rpc("request_refund", { p_payment_id: payment.payment_id, p_amount_minor: 9000, p_reason: "kitchen closed" });
    expect(refund.error).toBeNull();
    const pending = refund.data as { refund_id: string; status: string };
    expect(pending.status).toBe("pending");
    const done = await server.rpc("apply_payment_event", {
      p_gateway_key: "test",
      p_event: { id: `evt-refund-${pending.refund_id}`, type: "refund.succeeded", payment_id: payment.payment_id, refund_id: pending.refund_id },
    });
    expect(done.data).toBe("refunded");
    const after = (await a.client.from("orders").select("status, payment_status, refunded_minor").eq("id", order.order_id).single()).data;
    expect(after).toEqual({ status: "refunded", payment_status: "refunded", refunded_minor: 9000 });
  });

  it("restaurants never see GoMenu's gateway terms or connection secrets", async () => {
    const { data } = await a.client.rpc("list_payment_gateways", { p_restaurant_id: a.restaurantId });
    expect(JSON.stringify(data)).not.toMatch(/fee|terms|secret|ciphertext/);
    expect((await a.client.rpc("payment_connection_secret", { p_payment_id: crypto.randomUUID() })).error?.code).toBe("42501");
    expect((await a.client.rpc("platform_list_gateways")).error?.code).toBe("42501");
  });
});
