import { defineConfig } from "vitest/config";

// Integration tests run against a local Supabase stack (`pnpm db:start`).
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
