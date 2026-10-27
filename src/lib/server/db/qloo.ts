/**
 * Qloo response cache (survives cold starts), monthly call counter, and cached audience estimates.
 * Expired cache rows are deleted when read and by cleanupQlooCache().
 */
import { and, eq, lt, sql } from "drizzle-orm";
import { db, nowIso } from "./client";
import { eventAudience, qlooCache, qlooUsage } from "./schema";

export async function cacheGet<T>(key: string): Promise<T | null> {
  const [row] = await db().select().from(qlooCache).where(eq(qlooCache.key, key));
  if (!row) return null;
  if (row.expiresAt <= nowIso()) {
    await db().delete(qlooCache).where(and(eq(qlooCache.key, key), lt(qlooCache.expiresAt, nowIso())));
    return null;
  }
  return JSON.parse(row.responseJson) as T;
}

export async function cacheSet(key: string, body: unknown, ttlMs: number) {
  const row = { key, responseJson: JSON.stringify(body), expiresAt: new Date(Date.now() + ttlMs).toISOString(), updatedAt: nowIso() };
  await db().insert(qlooCache).values(row).onConflictDoUpdate({ target: qlooCache.key, set: { responseJson: row.responseJson, expiresAt: row.expiresAt, updatedAt: row.updatedAt } });
}

/** Deletes every expired cache row. Returns how many were removed. */
export async function cleanupQlooCache(): Promise<number> {
  return (await db().delete(qlooCache).where(lt(qlooCache.expiresAt, nowIso())).returning({ key: qlooCache.key })).length;
}

const month = () => new Date().toISOString().slice(0, 7);

export async function usageThisMonth(): Promise<number> {
  const [r] = await db().select({ calls: qlooUsage.calls }).from(qlooUsage).where(eq(qlooUsage.id, month()));
  return r?.calls ?? 0;
}

export async function countCall() {
  await db().insert(qlooUsage).values({ id: month(), calls: 1 }).onConflictDoUpdate({ target: qlooUsage.id, set: { calls: sql`${qlooUsage.calls} + 1`, updatedAt: nowIso() } });
}

export async function saveConnected(eventId: string, ids: string[]) {
  const row = { id: eventId, connectedIdsJson: JSON.stringify(ids), updatedAt: nowIso() };
  await db().insert(eventAudience).values(row).onConflictDoUpdate({ target: eventAudience.id, set: { connectedIdsJson: row.connectedIdsJson, updatedAt: row.updatedAt } });
}

export async function getConnected(eventId: string): Promise<string[] | null> {
  const [r] = await db().select().from(eventAudience).where(eq(eventAudience.id, eventId));
  return r ? (JSON.parse(r.connectedIdsJson) as string[]) : null;
}
