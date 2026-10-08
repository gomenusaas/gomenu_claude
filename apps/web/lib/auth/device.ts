import "server-only";
import { cookies, headers } from "next/headers";
import { randomToken } from "@/lib/crypto";
import { createClient } from "@/lib/supabase/server";

export const DEVICE_COOKIE = "gm_device";

/** Long-lived, httpOnly random identifier for this browser (never readable by scripts). */
export async function getDeviceToken(create = false): Promise<string | null> {
  const jar = await cookies();
  const existing = jar.get(DEVICE_COOKIE)?.value;
  if (existing || !create) return existing ?? null;
  const token = randomToken();
  jar.set(DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
  });
  return token;
}

/** After any OTP login on this browser: trust the device (spec §4: OTP only on new devices). */
export async function afterOtpLogin() {
  const supabase = await createClient();
  const token = await getDeviceToken(true);
  const ua = (await headers()).get("user-agent") ?? "";
  await supabase.rpc("register_trusted_device", {
    p_device_token: token!,
    p_label: deviceLabel(ua),
    p_user_agent: ua,
  });
  await supabase.rpc("record_auth_event", { p_action: "auth.login_otp" });
}

function deviceLabel(ua: string): string {
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "Browser";
  return `${browser} on ${os}`;
}
