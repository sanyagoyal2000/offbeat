/**
 * Seeds the database configured by TURSO_DATABASE_URL (from .env.local) with the sample data.
 * Safe to run more than once. Usage: npm run db:seed
 */
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { seedDatabase } = await import("../src/lib/server/db/seed");
  const { closeDb, databaseConfig } = await import("../src/lib/server/db/client");
  const target = databaseConfig().url.replace(/\/\/([^.]+)/, "//$1".replace("$1", "***"));
  console.log(`Seeding ${target}`);
  const started = Date.now();
  const report = await seedDatabase();
  console.table(Object.fromEntries(Object.entries(report).map(([table, r]) => [table, { inserted: r.inserted, "already there": r.total - r.inserted, total: r.total }])));
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s. All seeded rows are marked is_sample = 1.`);
  closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
