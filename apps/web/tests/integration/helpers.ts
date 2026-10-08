import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";
import type { Database } from "../../lib/database.types";
import { totp } from "../shared/totp";

// Defaults are the well-known LOCAL Supabase development keys (identical on every machine).
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
export const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
export const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
export const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export type Client = SupabaseClient<Database>;

export const db = new pg.Pool({ connectionString: DB_URL, max: 2 });

export function anonClient(): Client {
  return createClient<Database>(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function serviceClient(): Client {
  return createClient<Database>(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** A random, valid-looking Omani mobile number in E.164 so test runs never collide. */
export function randomPhone(): string {
  return `+9689${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
}

/** Latest message queued for a phone (the outbox is the local delivery channel). */
export async function latestOutbox(phone: string, template: string) {
  const { rows } = await db.query(
    `select payload from private.message_outbox where to_phone_e164 = $1 and template = $2
      order by created_at desc limit 1`,
    [phone, template],
  );
  if (!rows[0]) throw new Error(`no ${template} message for ${phone}`);
  return rows[0].payload as Record<string, string>;
}

/** Real phone OTP sign-in: GoTrue -> Send SMS hook -> outbox -> verify. */
export async function signInWithPhone(phone: string, fullName?: string): Promise<Client> {
  const client = anonClient();
  const sent = await client.auth.signInWithOtp({ phone, options: fullName ? { data: { full_name: fullName } } : {} });
  if (sent.error) throw sent.error;
  const { otp } = await latestOutbox(phone, "auth_otp");
  const verified = await client.auth.verifyOtp({ phone, token: otp, type: "sms" });
  if (verified.error) throw verified.error;
  return client;
}

/** Owner registration exactly as the app does it. */
export async function registerOwner(name: string) {
  const phone = randomPhone();
  const client = await signInWithPhone(phone, `${name} Owner`);
  const slug = `${name.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`;
  const { data: restaurantId, error } = await client.rpc("create_restaurant", {
    p_name: `${name} Restaurant`,
    p_slug: slug,
    p_branch_name: `${name} Main`,
    p_accept_terms: true,
  });
  if (error) throw error;
  return { client, phone, restaurantId: restaurantId as string };
}

/** Every table PostgREST exposes, read from the catalog so new tables are covered. */
export async function publicTables(): Promise<string[]> {
  const { rows } = await db.query(`select tablename from pg_tables where schemaname = 'public' order by 1`);
  return rows.map((r) => r.tablename as string);
}

export async function tenantTables(): Promise<{ table: string; column: string }[]> {
  const { rows } = await db.query(
    `select table_name from information_schema.columns
      where table_schema = 'public' and column_name = 'restaurant_id' order by 1`,
  );
  return [{ table: "restaurants", column: "id" }, ...rows.map((r) => ({ table: r.table_name as string, column: "restaurant_id" }))];
}

/** A platform staff member signed in with email + password and upgraded to aal2 via TOTP. */
export async function platformStaff(role: string): Promise<{ aal1: Client; aal2: Client }> {
  const email = `${role}-${Math.random().toString(36).slice(2, 8)}@gomenu.test`;
  const password = `Pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const admin = serviceClient();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  await db.query("insert into public.platform_staff (user_id, role) values ($1, $2)", [created.data.user.id, role]);

  const aal1 = anonClient();
  const login = await aal1.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;

  const aal2 = anonClient();
  await aal2.auth.signInWithPassword({ email, password });
  const enrolled = await aal2.auth.mfa.enroll({ factorType: "totp" });
  if (enrolled.error) throw enrolled.error;
  const verified = await aal2.auth.mfa.challengeAndVerify({ factorId: enrolled.data.id, code: totp(enrolled.data.totp.secret) });
  if (verified.error) throw verified.error;
  return { aal1, aal2 };
}
