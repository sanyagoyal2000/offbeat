/** Organizer accounts, sessions and login throttling. Passwords are hashed by the caller (scrypt). */
import { createHash } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db, newId, nowIso, runBatch } from "./client";
import { loginAttempts, organizerAccounts, organizerSessions, organizers } from "./schema";

export type Account = { id: string; email: string; name: string; orgId: string; salt: string; hash: string; createdAt: string; demo?: boolean };

const toAccount = (a: typeof organizerAccounts.$inferSelect): Account => ({ id: a.id, email: a.email, name: a.name, orgId: a.organizerId, salt: a.passwordSalt, hash: a.passwordHash, createdAt: a.createdAt, ...(a.isDemo ? { demo: true } : {}) });
const tokenId = (token: string) => createHash("sha256").update(token).digest("hex");

export async function accountByEmail(email: string): Promise<Account | null> {
  const [a] = await db().select().from(organizerAccounts).where(eq(organizerAccounts.email, email.toLowerCase()));
  return a ? toAccount(a) : null;
}

/** Creates the organizer and its account together. Returns null if the email is taken. */
export async function createAccountWithOrganizer(a: { email: string; name: string; salt: string; hash: string; demo?: boolean }, org: { id?: string; name: string; cityId: string; about: string } | { existingId: string }): Promise<Account | null> {
  const orgId = "existingId" in org ? org.existingId : (org.id ?? newId());
  const id = newId();
  try {
    await runBatch([
      ...("existingId" in org ? [] : [db().insert(organizers).values({ id: orgId, name: org.name, city: org.cityId, about: org.about, contactEmail: a.email.toLowerCase() })]),
      db().insert(organizerAccounts).values({ id, organizerId: orgId, email: a.email.toLowerCase(), name: a.name, passwordSalt: a.salt, passwordHash: a.hash, isDemo: !!a.demo }),
    ]);
  } catch (e) {
    if (String((e as Error).message).includes("UNIQUE")) return null;
    throw e;
  }
  return accountByEmail(a.email);
}

export async function recentAttempts(email: string, windowMs: number): Promise<number> {
  const since = new Date(Date.now() - windowMs).toISOString();
  const [r] = await db().select({ n: sql<number>`count(*)` }).from(loginAttempts).where(and(eq(loginAttempts.email, email.toLowerCase()), gt(loginAttempts.createdAt, since)));
  return r.n;
}
export const recordFailedAttempt = (email: string) => db().insert(loginAttempts).values({ id: newId(), email: email.toLowerCase() });
export const clearAttempts = (email: string) => db().delete(loginAttempts).where(eq(loginAttempts.email, email.toLowerCase()));

export async function createSession(token: string, accountId: string, expiresAt: Date) {
  await db().insert(organizerSessions).values({ id: tokenId(token), accountId, expiresAt: expiresAt.toISOString() });
  // Opportunistic cleanup of expired sessions.
  await db().delete(organizerSessions).where(lt(organizerSessions.expiresAt, nowIso()));
}

export async function accountForToken(token: string): Promise<Account | null> {
  const [row] = await db()
    .select({ account: organizerAccounts })
    .from(organizerSessions)
    .innerJoin(organizerAccounts, eq(organizerAccounts.id, organizerSessions.accountId))
    .where(and(eq(organizerSessions.id, tokenId(token)), gt(organizerSessions.expiresAt, nowIso())));
  return row ? toAccount(row.account) : null;
}

export const deleteSession = (token: string) => db().delete(organizerSessions).where(eq(organizerSessions.id, tokenId(token)));
