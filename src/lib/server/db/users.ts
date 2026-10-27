/**
 * Users repository. Visitors are anonymous: the `ob_uid` cookie maps to one users row, created on
 * first use. Taste anchors (Qloo entities) live in user_anchors, max 10 per user.
 */
import { createHash } from "node:crypto";
import { and, asc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, newId, nowIso } from "./client";
import { userAnchors, userSessions, users } from "./schema";

export const MAX_ANCHORS = 10;

const idCache = new Map<string, string>(); // cookie id → user id (never changes once created)

/** The users.id for an anonymous cookie id, creating the row if needed (one round trip). */
export async function userIdFor(cookieId: string): Promise<string> {
  const hit = idCache.get(cookieId);
  if (hit) return hit;
  const [row] = await db()
    .insert(users)
    .values({ id: newId(), anonCookieId: cookieId })
    .onConflictDoUpdate({ target: users.anonCookieId, set: { anonCookieId: sql`excluded.anon_cookie_id` } })
    .returning({ id: users.id });
  idCache.set(cookieId, row.id);
  return row.id;
}

export type Anchor = { id: string; name: string; type: string; image?: string; detail?: string };
export type TasteRow = { anchors: Anchor[]; notes: { text: string }[]; skipped: boolean; updatedAt?: string };

export async function getTaste(cookieId: string): Promise<TasteRow> {
  const userId = await userIdFor(cookieId);
  const [[u], anchors] = await db().batch([
    db().select({ notes: users.tasteNotesJson, skipped: users.tasteSkipped, updatedAt: users.updatedAt }).from(users).where(eq(users.id, userId)),
    db().select().from(userAnchors).where(eq(userAnchors.userId, userId)).orderBy(asc(userAnchors.position)),
  ]);
  return {
    anchors: anchors.map((a) => ({ id: a.qlooEntityId, name: a.name, type: a.qlooType, ...(a.imageUrl ? { image: a.imageUrl } : {}), ...(a.detail ? { detail: a.detail } : {}) })),
    notes: u?.notes ? (JSON.parse(u.notes) as { text: string }[]) : [],
    skipped: !!u?.skipped,
    updatedAt: u?.updatedAt,
  };
}

export class TooManyAnchors extends Error {}

/** Replaces the user's anchors and notes. Enforces the 10-anchor limit and de-duplicates by Qloo id. */
export async function saveTaste(cookieId: string, t: { anchors: Anchor[]; notes: { text: string }[]; skipped?: boolean }) {
  const unique = [...new Map(t.anchors.map((a) => [a.id, a])).values()];
  if (unique.length > MAX_ANCHORS) throw new TooManyAnchors(`You can add up to ${MAX_ANCHORS} interests.`);
  const userId = await userIdFor(cookieId);
  const d = db();
  await d.batch([
    d.update(users).set({ tasteNotesJson: JSON.stringify(t.notes), tasteSkipped: !!t.skipped, updatedAt: nowIso() }).where(eq(users.id, userId)),
    d.delete(userAnchors).where(eq(userAnchors.userId, userId)),
    ...(unique.length
      ? [d.insert(userAnchors).values(unique.map((a, position) => ({ id: newId(), userId, qlooEntityId: a.id, qlooType: a.type, name: a.name, imageUrl: a.image ?? null, detail: a.detail ?? null, position })))]
      : []),
  ]);
}

/* ── Preferences and audience opt-in ── */

export async function getPrefsJson(cookieId: string): Promise<string | null> {
  const userId = await userIdFor(cookieId);
  const [u] = await db().select({ prefs: users.prefsJson }).from(users).where(eq(users.id, userId));
  return u?.prefs ?? null;
}

export async function savePrefsJson(cookieId: string, prefsJson: string, audienceOptIn: boolean) {
  const userId = await userIdFor(cookieId);
  await db().update(users).set({ prefsJson, audienceOptIn, updatedAt: nowIso() }).where(eq(users.id, userId));
}

/** Anchors of every user who opted in to anonymous audience counts. Returned per user, without names or ids of the people. */
export async function optedInAnchorSets(): Promise<{ key: string; anchors: Anchor[] }[]> {
  const rows = await db()
    .select({ userId: userAnchors.userId, id: userAnchors.qlooEntityId, name: userAnchors.name, type: userAnchors.qlooType })
    .from(userAnchors)
    .innerJoin(users, eq(users.id, userAnchors.userId))
    .where(eq(users.audienceOptIn, true));
  const by = new Map<string, Anchor[]>();
  for (const r of rows) by.set(r.userId, [...(by.get(r.userId) ?? []), { id: r.id, name: r.name, type: r.type }]);
  return [...by.entries()].map(([key, anchors]) => ({ key, anchors }));
}

export async function countOptedIn(): Promise<number> {
  const [r] = await db().select({ n: sql<number>`count(*)` }).from(users).where(eq(users.audienceOptIn, true));
  return r.n;
}

/** Store the visitor's home location (also kept in a cookie for the UI). */
export async function saveHome(cookieId: string, home: { cityId: string; lat: number; lng: number; radiusKm?: number } | null) {
  const userId = await userIdFor(cookieId);
  await db().update(users).set({ homeCity: home?.cityId ?? null, homeLat: home?.lat ?? null, homeLng: home?.lng ?? null, radiusKm: home?.radiusKm ?? null, updatedAt: nowIso() }).where(eq(users.id, userId));
}

/* ── Accounts (username + password) ── */

export type UserAccount = { userId: string; key: string; username: string; displayName: string };
const tokenId = (token: string) => createHash("sha256").update(token).digest("hex");
const toAccount = (u: typeof users.$inferSelect): UserAccount => ({ userId: u.id, key: u.anonCookieId, username: u.username!, displayName: u.displayName ?? u.username! });

export async function accountByUsername(username: string): Promise<(UserAccount & { salt: string; hash: string }) | null> {
  const [u] = await db().select().from(users).where(eq(users.username, username.toLowerCase()));
  return u?.username && u.passwordSalt && u.passwordHash ? { ...toAccount(u), salt: u.passwordSalt, hash: u.passwordHash } : null;
}

/**
 * Turns the current guest into an account, keeping all their data (same users row). The row's
 * anon_cookie_id is rotated to an internal key so the old guest cookie no longer reaches it.
 * Returns null if the username is taken.
 */
export async function claimGuest(cookieId: string, a: { username: string; displayName: string; salt: string; hash: string }): Promise<UserAccount | null> {
  await userIdFor(cookieId);
  try {
    const [u] = await db()
      .update(users)
      .set({ username: a.username.toLowerCase(), displayName: a.displayName, passwordSalt: a.salt, passwordHash: a.hash, anonCookieId: `acct:${newId()}`, updatedAt: nowIso() })
      .where(and(eq(users.anonCookieId, cookieId), isNull(users.username)))
      .returning();
    idCache.delete(cookieId);
    return u ? toAccount(u) : null;
  } catch (e) {
    if (String((e as Error).message).includes("UNIQUE")) return null;
    throw e;
  }
}

export async function createUserSession(token: string, userId: string, expiresAt: Date) {
  await db().insert(userSessions).values({ id: tokenId(token), userId, expiresAt: expiresAt.toISOString() });
  await db().delete(userSessions).where(lt(userSessions.expiresAt, nowIso()));
}

export async function accountForUserToken(token: string): Promise<UserAccount | null> {
  const [row] = await db()
    .select({ u: users })
    .from(userSessions)
    .innerJoin(users, eq(users.id, userSessions.userId))
    .where(and(eq(userSessions.id, tokenId(token)), gt(userSessions.expiresAt, nowIso())));
  return row?.u.username ? toAccount(row.u) : null;
}

export const deleteUserSession = (token: string) => db().delete(userSessions).where(eq(userSessions.id, tokenId(token)));

/** Display names for users (boards show who joined). Guests have none. */
export async function namesFor(userIds: string[]): Promise<Map<string, string>> {
  if (!userIds.length) return new Map();
  const rows = await db().select({ id: users.id, name: users.displayName, username: users.username }).from(users).where(inArray(users.id, userIds));
  return new Map(rows.filter((r) => r.username).map((r) => [r.id, r.name ?? r.username!]));
}

/** Taste anchors for a set of users (combined interests on a board). */
export async function anchorsForUsers(userIds: string[]): Promise<Anchor[]> {
  if (!userIds.length) return [];
  const rows = await db().select().from(userAnchors).where(inArray(userAnchors.userId, userIds)).orderBy(asc(userAnchors.position));
  return rows.map((a) => ({ id: a.qlooEntityId, name: a.name, type: a.qlooType, ...(a.imageUrl ? { image: a.imageUrl } : {}) }));
}
