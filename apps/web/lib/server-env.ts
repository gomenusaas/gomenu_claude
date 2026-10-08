import "server-only";
import { z } from "zod";

/** Server-only secrets. Importing this from client code fails the build. */
export const serverEnv = z
  .object({
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
    // Shows OTP codes and invitation links at /dev/outbox. Never set in production.
    GOMENU_DEV_OUTBOX: z.enum(["true", "false"]).default("false"),
  })
  .parse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    GOMENU_DEV_OUTBOX: process.env.GOMENU_DEV_OUTBOX || undefined,
  });
