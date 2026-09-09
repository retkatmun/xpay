import "dotenv/config"
import type { Config } from "drizzle-kit"

export default {
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://xpay:xpay@localhost:5433/xpay",
  },
} satisfies Config
