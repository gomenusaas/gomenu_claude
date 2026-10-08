import { beforeAll, describe, expect, it } from "vitest";
import {
  anonClient, latestOutbox, publicTables, randomPhone, registerOwner, serviceClient, signInWithPhone, type Client,
} from "./helpers";

// The full two-gate onboarding through the real API, then proof that the resulting New Staff
// session has zero data access.
describe("staff invitation -> New Staff with zero access", () => {
  let owner: { client: Client; restaurantId: string };
  const staffPhone = randomPhone();
  let token: string;
  let staff: Client;
  let membershipId: string;

  beforeAll(async () => {
    owner = await registerOwner("Charlie");
  });

  it("owner invites by name + mobile; a WhatsApp message with a token is queued", async () => {
    const { error } = await owner.client.rpc("invite_staff", {
      p_restaurant_id: owner.restaurantId,
      p_full_name: "Dana Staff",
      p_phone_e164: staffPhone,
    });
    expect(error).toBeNull();
    token = (await latestOutbox(staffPhone, "staff_invitation")).token;
    expect(token.length).toBeGreaterThanOrEqual(43);
  });

  it("anyone with the link sees only a masked number", async () => {
    const { data } = await anonClient().rpc("get_invitation_preview", { p_token: token });
    const preview = data as { status: string; phone_masked: string };
    expect(preview.status).toBe("valid");
    expect(preview.phone_masked).not.toContain(staffPhone.slice(4, 9));
  });

  it("a forwarded link grants nothing to a different (verified) number", async () => {
    const stranger = await signInWithPhone(randomPhone());
    const { error } = await stranger.rpc("accept_staff_invitation", { p_token: token });
    expect(error?.code).toBe("42501");
  });

  it("the invitee verifies the OTP sent to the invited number, sets a PIN and becomes New Staff", async () => {
    const opened = await serviceClient().rpc("open_invitation", { p_token: token });
    expect(opened.data).toBe(staffPhone);

    staff = await signInWithPhone(staffPhone);
    const accepted = await staff.rpc("accept_staff_invitation", { p_token: token });
    expect(accepted.error).toBeNull();
    membershipId = accepted.data as string;

    const pin = await staff.rpc("complete_staff_verification", { p_membership_id: membershipId, p_pin: "583920" });
    expect(pin.data).toBe(true);

    const { data: ctx } = await staff.rpc("get_my_context");
    expect((ctx as { next: string }).next).toBe("pending");
  });

  it("New Staff reads ZERO rows from every table except their own profile", async () => {
    const { data: me } = await staff.auth.getUser();
    for (const table of await publicTables()) {
      const { data, error } = await staff.from(table as "restaurants").select("*");
      if (table === "profiles") {
        expect(data!.map((p) => (p as { id: string }).id)).toEqual([me.user!.id]);
      } else {
        // Either RLS returns no rows, or the table/column is not granted at all (42501).
        if (error) expect(error.code, table).toBe("42501");
        else expect(data, table).toEqual([]);
      }
    }
  });

  it("New Staff cannot use any privileged RPC, storage or realtime channel", async () => {
    const invite = await staff.rpc("invite_staff", {
      p_restaurant_id: owner.restaurantId, p_full_name: "X", p_phone_e164: randomPhone(),
    });
    expect(invite.error?.code).toBe("42501");
    const perms = await staff.rpc("my_permissions", { p_restaurant_id: owner.restaurantId });
    expect(perms.data).toEqual([]);
    const list = await staff.storage.from("restaurant-private").list(owner.restaurantId);
    expect(list.data ?? []).toEqual([]);
    const upload = await staff.storage
      .from("restaurant-public")
      .upload(`${owner.restaurantId}/x.png`, new Blob(["x"]), { contentType: "image/png" });
    expect(upload.error).not.toBeNull();
  });

  it("the owner sees 'New Staff Verified' and can activate them with a role", async () => {
    const { data: notes } = await owner.client.from("restaurant_notifications").select("kind, title");
    expect(notes).toContainEqual({ kind: "staff.verified", title: "New Staff Verified" });

    const { data: waiter } = await owner.client.from("roles").select("id").eq("key", "waiter").is("restaurant_id", null).single();
    const { data: branch } = await owner.client.from("branches").select("id").eq("restaurant_id", owner.restaurantId).single();
    const assigned = await owner.client.rpc("assign_staff_role", {
      p_membership_id: membershipId, p_role_id: waiter!.id, p_branch_scope: "selected", p_branch_ids: [branch!.id],
    });
    expect(assigned.error).toBeNull();

    const { data: ctx } = await staff.rpc("get_my_context");
    expect((ctx as { next: string }).next).toBe("restaurant");
    const { data: restaurants } = await staff.from("restaurants").select("id");
    expect(restaurants).toEqual([{ id: owner.restaurantId }]);
  });

  it("the token was single-use", async () => {
    const { data } = await anonClient().rpc("get_invitation_preview", { p_token: token });
    expect((data as { status: string }).status).toBe("consumed");
  });
});
