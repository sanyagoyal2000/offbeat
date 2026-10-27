/**
 * Wishes repository. Demand views only ever see opted-in wishes (opted_in = 1, filtered in SQL),
 * and the records they get carry no user identifier or free text, only what aggregation needs.
 */
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import type { Wish, WishInput } from "@/lib/wishes";
import { db, newId, nowIso } from "./client";
import { fromDbAmountOrNull, toDbAmountOrNull } from "./money";
import { users, wishProposals, wishQlooLinks, wishes } from "./schema";
import { userIdFor } from "./users";

type WishRow = typeof wishes.$inferSelect;

/** "YYYY-MM-DD/YYYY-MM-DD" (ISO-8601 interval; ".." = open) ↔ from/to. */
export const toDayPref = (from: string | null, to: string | null) => (from || to ? `${from ?? ".."}/${to ?? ".."}` : null);
export function fromDayPref(p: string | null): { from: string | null; to: string | null } {
  if (!p) return { from: null, to: null };
  const [a, b] = p.split("/");
  return { from: a && a !== ".." ? a : null, to: b && b !== ".." ? b : null };
}

async function hydrate(rows: WishRow[], opts: { anonymous: boolean }): Promise<Wish[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [links, proposals, owners] = await db().batch([
    db().select().from(wishQlooLinks).where(inArray(wishQlooLinks.wishId, ids)),
    db().select().from(wishProposals).where(inArray(wishProposals.wishId, ids)).orderBy(asc(wishProposals.createdAt)),
    db().select({ id: users.id, cookie: users.anonCookieId }).from(users).where(inArray(users.id, opts.anonymous ? [] : [...new Set(rows.map((r) => r.userId))])),
  ]);
  const cookieOf = new Map(owners.map((o) => [o.id, o.cookie]));
  return rows.map((r) => ({
    id: r.id,
    /** The owner's visitor (cookie) id; empty in anonymous aggregate reads. */
    uid: opts.anonymous ? "" : (cookieOf.get(r.userId) ?? ""),
    source: r.isSample ? "seed" : "real",
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    text: opts.anonymous ? "" : r.rawText,
    category: r.genre as Wish["category"],
    keywords: JSON.parse(r.keywordsJson) as string[],
    ...fromDayPref(r.dayPref),
    budgetMax: fromDbAmountOrNull(r.budgetAmount, r.currency),
    currency: r.currency,
    location: { cityId: r.city, cityName: r.cityName, area: r.area, lat: r.lat, lng: r.lng, radiusKm: r.radiusKm },
    tasteRefs: links.filter((l) => l.wishId === r.id).map((l) => ({ id: l.qlooEntityId, name: l.name })),
    notify: r.optedIn,
    proposals: proposals.filter((p) => p.wishId === r.id).map((p) => ({ eventId: p.eventId, organizerId: p.organizerId, at: p.createdAt })),
  }));
}

export function wishRows(w: WishInput & { id: string; userId: string; isSample: boolean; createdAt?: string; status?: Wish["status"] }) {
  const at = w.createdAt ?? nowIso();
  return {
    wish: {
      id: w.id,
      userId: w.userId,
      rawText: w.text,
      genre: w.category,
      keywordsJson: JSON.stringify(w.keywords),
      dayPref: toDayPref(w.from, w.to),
      budgetAmount: toDbAmountOrNull(w.budgetMax, w.currency),
      currency: w.currency,
      city: w.location.cityId,
      cityName: w.location.cityName,
      area: w.location.area,
      lat: w.location.lat,
      lng: w.location.lng,
      radiusKm: w.location.radiusKm,
      optedIn: w.notify,
      status: w.status ?? "open",
      isSample: w.isSample,
      createdAt: at,
      updatedAt: at,
    },
    links: w.tasteRefs.map((r) => ({ id: newId(), wishId: w.id, qlooEntityId: r.id, name: r.name })),
  };
}

export async function createWish(cookieId: string, input: WishInput): Promise<Wish> {
  const userId = await userIdFor(cookieId);
  const { wish, links } = wishRows({ ...input, id: newId(), userId, isSample: false });
  await db().batch([db().insert(wishes).values(wish), ...(links.length ? [db().insert(wishQlooLinks).values(links)] : [])]);
  return (await getWish(wish.id))!;
}

export async function getWish(id: string): Promise<Wish | null> {
  const rows = await db().select().from(wishes).where(eq(wishes.id, id));
  return (await hydrate(rows, { anonymous: false }))[0] ?? null;
}

export async function wishesForUser(cookieId: string): Promise<Wish[]> {
  const userId = await userIdFor(cookieId);
  return hydrate(await db().select().from(wishes).where(eq(wishes.userId, userId)).orderBy(desc(wishes.createdAt)), { anonymous: false });
}

export async function updateWish(cookieId: string, id: string, patch: Partial<WishInput> & { status?: "open" | "withdrawn" }): Promise<Wish | null> {
  const userId = await userIdFor(cookieId);
  const current = await getWish(id);
  if (!current || current.uid !== cookieId) return null;
  const merged = { ...current, ...patch };
  const status = patch.status === "withdrawn" ? "withdrawn" : patch.status === "open" ? (current.proposals.length ? "proposed" : "open") : current.status;
  const { wish, links } = wishRows({ ...merged, id, userId, isSample: false, createdAt: current.createdAt, status });
  await db().batch([
    db().update(wishes).set({ ...wish, id: undefined, createdAt: undefined, updatedAt: nowIso() }).where(eq(wishes.id, id)),
    ...(patch.tasteRefs ? [db().delete(wishQlooLinks).where(eq(wishQlooLinks.wishId, id)), ...(links.length ? [db().insert(wishQlooLinks).values(links)] : [])] : []),
  ]);
  return getWish(id);
}

/** Opted-in, non-withdrawn wishes for aggregation (optionally one city). Anonymous: no user ids or text. */
export async function optedInWishes(city?: string): Promise<Wish[]> {
  const rows = await db()
    .select()
    .from(wishes)
    .where(and(eq(wishes.optedIn, true), ne(wishes.status, "withdrawn"), city ? eq(wishes.city, city) : undefined))
    .orderBy(asc(wishes.createdAt));
  return hydrate(rows, { anonymous: true });
}

/** Real (non-sample) opted-in wishes with owners, for attaching proposals and notifying owners in-app. */
export async function realOptedInWishesWithOwners(city: string): Promise<Wish[]> {
  const rows = await db().select().from(wishes).where(and(eq(wishes.optedIn, true), eq(wishes.isSample, false), ne(wishes.status, "withdrawn"), eq(wishes.city, city)));
  return hydrate(rows, { anonymous: false });
}

export async function addProposal(wishId: string, eventId: string, organizerId: string): Promise<boolean> {
  const [inserted] = await db().insert(wishProposals).values({ id: newId(), wishId, eventId, organizerId }).onConflictDoNothing().returning({ id: wishProposals.id });
  if (inserted) await db().update(wishes).set({ status: "proposed", updatedAt: nowIso() }).where(and(eq(wishes.id, wishId), ne(wishes.status, "withdrawn")));
  return !!inserted;
}
