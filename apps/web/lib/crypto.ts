import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { serverEnv } from "@/lib/server-env";

type KeyName = "session" | "payments";
const key = (name: KeyName) =>
  Buffer.from(name === "payments" ? serverEnv.GOMENU_PAYMENTS_KEY : serverEnv.GOMENU_SESSION_KEY, "base64");

/** AES-256-GCM. Output: base64(iv | tag | ciphertext). */
export function seal(plaintext: string, keyName: KeyName = "session"): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(keyName), iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function open(sealed: string, keyName: KeyName = "session"): string {
  const raw = Buffer.from(sealed, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(keyName), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
