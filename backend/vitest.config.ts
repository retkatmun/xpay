import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgres://xpay:xpay@localhost:5433/xpay",
      SESSION_SECRET: "test-secret-for-unit-tests-only-minimum-32chars!",

      // ── Provider credentials — safe placeholders for unit tests ──────────
      // These values are never used in unit tests (mock providers are loaded
      // instead). They exist only to satisfy the config schema validator so
      // process.exit(1) is not triggered on startup.
      PAYSTACK_SECRET_KEY: "sk_test_placeholder_for_unit_tests_only",
      BASE_RPC_URL: "https://sepolia.base.org",
      BASE_PRIVATE_KEY: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      FX_API_KEY: "test_fx_api_key_placeholder",
    },
    // Only run unit tests (no .e2e files)
    include: ["test/**/*.test.ts"],
  },
})
