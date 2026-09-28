import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    setupFiles: ["./tests/setup.ts"],
    hookTimeout: 30_000,
    testTimeout: 30_000,
    env: {
      NODE_ENV: "test",
      JWT_SECRET: "test-jwt-secret",
      WEBHOOK_SECRET: "test-webhook-secret",
      DATABASE_URL:
        "postgresql://eve:eve@localhost:5432/eve_healthcare_test?schema=public",
      LOG_LEVEL: "silent",
      BCRYPT_ROUNDS: "4",
    },
  },
});
