import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  dialect: "turso",
  schema: "./src/lib/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN },
});
