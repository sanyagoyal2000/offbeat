/**
 * The one database client (Turso / libSQL via Drizzle).
 * - App and scripts: TURSO_DATABASE_URL + TURSO_AUTH_TOKEN (the Turso database).
 * - Tests (Vitest): always the local file database file:./test.db, whatever the env says,
 *   so a test run can never touch real data.
 */
import { createClient, type Client } from "@libsql/client";
import type { BatchItem } from "drizzle-orm/batch";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema>;

export const TEST_DB_URL = "file:./test.db";

export function databaseConfig(): { url: string; authToken?: string } {
  if (process.env.VITEST) return { url: TEST_DB_URL };
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL is not set. See README → Database.");
  return { url, authToken: process.env.TURSO_AUTH_TOKEN || undefined };
}

const g = globalThis as unknown as { __offbeatDb?: { client: Client; db: Db } };

function open() {
  const client = createClient(databaseConfig());
  return { client, db: drizzle(client, { schema }) };
}

/** Lazily opened and reused across hot reloads. */
export function db(): Db {
  return (g.__offbeatDb ??= open()).db;
}
export function dbClient(): Client {
  return (g.__offbeatDb ??= open()).client;
}
/** Close the shared client (scripts and tests). */
export function closeDb() {
  g.__offbeatDb?.client.close();
  g.__offbeatDb = undefined;
}

/** Runs statements as one transaction (a libSQL batch). Empty lists are a no-op. */
export async function runBatch(items: BatchItem<"sqlite">[]) {
  if (!items.length) return;
  await db().batch(items as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
}

export const newId = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();
export { schema };
