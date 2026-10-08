import { beforeAll, describe, expect, it } from "vitest";
import { anonClient, db, platformStaff, registerOwner, type Client } from "./helpers";

// Phase 2 through the real API: trial, plan choice, invoice isolation, MFA-gated payment
// recording, and activation.
describe("billing and platform payments", () => {
  let owner: { client: Client; restaurantId: string };
  let other: { client: Client; restaurantId: string };
  let finance: { aal1: Client; aal2: Client };
  let invoiceId: string;

  beforeAll(async () => {
    owner = await registerOwner("Delta");
    other = await registerOwner("Echo");
    finance = await platformStaff("finance");
  });

  it("a new owner starts a Gold trial", async () => {
    const { data } = await owner.client.rpc("restaurant_entitlements", { p_restaurant_id: owner.restaurantId });
    const e = data as { status: string; plan_key: string; features: Record<string, { enabled: boolean }> };
    expect(e.status).toBe("trial");
    expect(e.plan_key).toBe("gold");
    expect(e.features.frames.enabled).toBe(true);
  });

  it("anyone can read public pricing; nobody but platform staff reads the price table", async () => {
    const { data } = await anonClient().rpc("get_public_pricing");
    expect((data as { plans: { key: string }[] }).plans.map((p) => p.key)).toEqual(["silver", "gold"]);
    const direct = await owner.client.from("billing_prices").select("*");
    expect(direct.data).toEqual([]);
  });

  it("the owner chooses Silver and gets an invoice only they can see", async () => {
    const { data, error } = await owner.client.rpc("choose_plan", { p_restaurant_id: owner.restaurantId, p_plan_key: "silver" });
    expect(error).toBeNull();
    invoiceId = data as string;
    const mine = await owner.client.from("billing_invoices").select("id, total_minor").eq("id", invoiceId);
    expect(mine.data).toEqual([{ id: invoiceId, total_minor: expect.any(Number) }]);
    const theirs = await other.client.from("billing_invoices").select("id").eq("id", invoiceId);
    expect(theirs.data).toEqual([]);
    const overview = await other.client.rpc("restaurant_billing_overview", { p_restaurant_id: owner.restaurantId });
    expect(overview.error?.code).toBe("42501");
  });

  it("restaurants cannot pay their own invoices or call platform RPCs", async () => {
    const { error } = await owner.client.rpc("platform_record_payment", {
      p_invoice_id: invoiceId, p_amount_minor: 1, p_method: "bank_transfer", p_reference: "SELF",
    });
    expect(error?.code).toBe("42501");
  });

  it("Finance without MFA (aal1) is refused; with the authenticator (aal2) the payment activates the plan", async () => {
    const { rows } = await db.query("select total_minor from public.billing_invoices where id = $1", [invoiceId]);
    const args = { p_invoice_id: invoiceId, p_amount_minor: Number(rows[0].total_minor), p_method: "bank_transfer" as const, p_reference: `TRX-${invoiceId.slice(0, 8)}` };

    const refused = await finance.aal1.rpc("platform_record_payment", args);
    expect(refused.error?.code).toBe("42501");

    const paid = await finance.aal2.rpc("platform_record_payment", args);
    expect(paid.error).toBeNull();
    const replay = await finance.aal2.rpc("platform_record_payment", args);
    expect(replay.data).toBe(paid.data); // idempotent

    const { data: overview } = await owner.client.rpc("restaurant_billing_overview", { p_restaurant_id: owner.restaurantId });
    const o = overview as { next_period: { plan_key: string } | null; invoices: { status: string }[] };
    // Paid during the trial: the Silver year starts when the trial ends.
    expect(o.next_period?.plan_key).toBe("silver");
    expect(o.invoices[0].status).toBe("paid");
  });

  it("platform reads of restaurant data are audited", async () => {
    const before = await db.query("select count(*)::int n from public.platform_audit_events where action = 'platform.restaurant_billing_viewed'");
    const { error } = await finance.aal2.rpc("platform_restaurant_billing", { p_restaurant_id: owner.restaurantId });
    expect(error).toBeNull();
    const after = await db.query("select count(*)::int n from public.platform_audit_events where action = 'platform.restaurant_billing_viewed'");
    expect(after.rows[0].n).toBe(before.rows[0].n + 1);
  });
});
