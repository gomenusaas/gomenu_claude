import "server-only";
import { z } from "zod";

/** Server-only secrets. Importing this from client code fails the build. */
export const serverEnv = z
  .object({
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
    // Shows OTP codes and invitation links at /dev/outbox. Never set in production.
    GOMENU_DEV_OUTBOX: z.enum(["true", "false"]).default("false"),
    // 32-byte key (base64) encrypting parked staff sessions on shared devices.
    GOMENU_SESSION_KEY: z.string().refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64"),
    // 32-byte key (base64) encrypting restaurants' payment gateway credentials and signing the
    // built-in test gateway's webhooks. Separate from the session key so either can rotate alone.
    GOMENU_PAYMENTS_KEY: z.string().refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64"),
    // AI provider (decision P3-Q2: Claude). "fake" is a deterministic stand-in for tests/dev.
    GOMENU_AI_PROVIDER: z.enum(["anthropic", "fake"]).optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    // Custom domains via Vercel (decision P3-Q4). Without a token a stand-in provider is used.
    VERCEL_TOKEN: z.string().optional(),
    VERCEL_PROJECT_ID: z.string().optional(),
    VERCEL_TEAM_ID: z.string().optional(),
    CRON_SECRET: z.string().optional(),
  })
  .parse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    GOMENU_DEV_OUTBOX: process.env.GOMENU_DEV_OUTBOX || undefined,
    GOMENU_SESSION_KEY: process.env.GOMENU_SESSION_KEY,
    GOMENU_PAYMENTS_KEY: process.env.GOMENU_PAYMENTS_KEY,
    GOMENU_AI_PROVIDER: process.env.GOMENU_AI_PROVIDER || undefined,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || undefined,
    VERCEL_TOKEN: process.env.VERCEL_TOKEN || undefined,
    VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID || undefined,
    VERCEL_TEAM_ID: process.env.VERCEL_TEAM_ID || undefined,
    CRON_SECRET: process.env.CRON_SECRET || undefined,
  });
