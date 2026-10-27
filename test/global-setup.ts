/**
 * Builds the test database once per run: file:./test.db is migrated and seeded, then copied to a
 * template. Each test file starts from a fresh copy (test/setup.ts). Never touches Turso.
 */
import { copyFileSync, rmSync } from "node:fs";
import { migrate } from "drizzle-orm/libsql/migrator";

export const TEMPLATE = "test.template.db";
const files = (base: string) => [base, `${base}-wal`, `${base}-shm`, `${base}-journal`];

export default async function setup() {
  process.env.VITEST = "true";
  for (const f of [...files("test.db"), ...files(TEMPLATE)]) rmSync(f, { force: true });
  const { db, closeDb, databaseConfig } = await import("../src/lib/server/db/client");
  if (databaseConfig().url !== "file:./test.db") throw new Error("Refusing to seed a non-test database");
  await migrate(db(), { migrationsFolder: "./drizzle" });
  const { seedDatabase } = await import("../src/lib/server/db/seed");
  await seedDatabase();
  closeDb();
  copyFileSync("test.db", TEMPLATE);
  return () => {
    for (const f of [...files("test.db"), ...files(TEMPLATE)]) rmSync(f, { force: true });
  };
}
