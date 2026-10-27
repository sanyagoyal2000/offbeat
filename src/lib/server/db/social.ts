/**
 * Saved events, saved searches, in-app notifications and shared boards.
 * Ids passed in and returned as `uid` are visitor cookie ids; rows reference users.id.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, newId, nowIso } from "./client";
import { fromDbAmount, toDbAmountOrNull } from "./money";
import { boardItems, boardParticipants, boardVotes, boards, notifications, savedEvents, savedSearches } from "./schema";
import { namesFor, userIdFor } from "./users";

/* ── Saved events ── */

export async function savedEventIds(cookieId: string): Promise<Set<string>> {
  const userId = await userIdFor(cookieId);
  return new Set((await db().select({ id: savedEvents.eventId }).from(savedEvents).where(eq(savedEvents.userId, userId))).map((r) => r.id));
}

/** Returns true when the save is new. */
export async function setSaved(cookieId: string, eventId: string, saved: boolean): Promise<boolean> {
  const userId = await userIdFor(cookieId);
  if (!saved) {
    await db().delete(savedEvents).where(and(eq(savedEvents.userId, userId), eq(savedEvents.eventId, eventId)));
    return false;
  }
  const rows = await db().insert(savedEvents).values({ id: newId(), userId, eventId }).onConflictDoNothing().returning({ id: savedEvents.id });
  return rows.length > 0;
}

/* ── Saved searches ── */

export type SavedSearch = { id: string; uid: string; label: string; query: string; cityId: string; cityName: string; createdAt: string };

export async function addSavedSearch(cookieId: string, s: { label: string; query: string; cityId: string; cityName: string }): Promise<SavedSearch> {
  const userId = await userIdFor(cookieId);
  const [r] = await db().insert(savedSearches).values({ id: newId(), userId, label: s.label, query: s.query, city: s.cityId, cityName: s.cityName }).returning();
  return { id: r.id, uid: cookieId, label: r.label, query: r.query, cityId: r.city, cityName: r.cityName, createdAt: r.createdAt };
}

export async function listSavedSearches(cookieId: string): Promise<SavedSearch[]> {
  const userId = await userIdFor(cookieId);
  const rows = await db().select().from(savedSearches).where(eq(savedSearches.userId, userId)).orderBy(desc(savedSearches.createdAt));
  return rows.map((r) => ({ id: r.id, uid: cookieId, label: r.label, query: r.query, cityId: r.city, cityName: r.cityName, createdAt: r.createdAt }));
}

export async function removeSavedSearch(cookieId: string, id: string) {
  const userId = await userIdFor(cookieId);
  await db().delete(savedSearches).where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId)));
}

/* ── Notifications ── */

export type Notification = { id: string; kind: "proposal" | "info"; title: string; body: string; href?: string; at: string; read: boolean };

export async function addNotification(cookieId: string, n: { kind: "proposal" | "info"; title: string; body: string; href?: string }) {
  const userId = await userIdFor(cookieId);
  await db().insert(notifications).values({ id: newId(), userId, kind: n.kind, title: n.title, body: n.body, href: n.href ?? null });
}

export async function listNotifications(cookieId: string, limit = 100): Promise<Notification[]> {
  const userId = await userIdFor(cookieId);
  const rows = await db().select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
  return rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, ...(r.href ? { href: r.href } : {}), at: r.createdAt, read: r.isRead }));
}

export async function markAllRead(cookieId: string) {
  const userId = await userIdFor(cookieId);
  await db().update(notifications).set({ isRead: true, updatedAt: nowIso() }).where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
}

/* ── Boards ── */

/**
 * A board's members are signed-in accounts that joined it (board_participants rows whose user has a
 * username). Guests can view a shared link but can't join, vote or edit. Ids here are users.id.
 */
export type Member = { userId: string; name: string; budgetMax?: number; from?: string; to?: string; joinedAt: string };
export type Board = {
  id: string;
  name: string;
  ownerId: string;
  cityId: string;
  cityName: string;
  currency: string;
  createdAt: string;
  items: { eventId: string; addedBy: string; addedAt: string }[];
  /** eventId → userIds of members who voted for it */
  votes: Record<string, string[]>;
  members: Member[];
};

async function loadBoards(ids: string[]): Promise<Board[]> {
  if (!ids.length) return [];
  const [rows, items, votes, parts] = await db().batch([
    db().select().from(boards).where(inArray(boards.id, ids)).orderBy(desc(boards.createdAt)),
    db().select().from(boardItems).where(inArray(boardItems.boardId, ids)).orderBy(asc(boardItems.createdAt)),
    db().select().from(boardVotes).where(inArray(boardVotes.boardId, ids)),
    db().select().from(boardParticipants).where(inArray(boardParticipants.boardId, ids)).orderBy(asc(boardParticipants.createdAt)),
  ]);
  const names = await namesFor([...new Set(parts.map((p) => p.userId))]);
  return rows.map((b) => {
    // Only accounts count as members; guest rows from before accounts existed are ignored.
    const members = parts
      .filter((p) => p.boardId === b.id && names.has(p.userId))
      .map((p) => ({ userId: p.userId, name: names.get(p.userId)!, ...(p.budgetMax !== null ? { budgetMax: fromDbAmount(p.budgetMax, b.currency) } : {}), ...(p.dateFrom ? { from: p.dateFrom } : {}), ...(p.dateTo ? { to: p.dateTo } : {}), joinedAt: p.createdAt }));
    const memberIds = new Set(members.map((m) => m.userId));
    const votesFor: Record<string, string[]> = {};
    for (const v of votes.filter((x) => x.boardId === b.id && memberIds.has(x.userId))) (votesFor[v.eventId] ??= []).push(v.userId);
    return {
      id: b.id,
      name: b.name,
      ownerId: b.ownerUserId,
      cityId: b.city,
      cityName: b.cityName,
      currency: b.currency,
      createdAt: b.createdAt,
      items: items.filter((i) => i.boardId === b.id).map((i) => ({ eventId: i.eventId, addedBy: i.addedByUserId, addedAt: i.createdAt })),
      votes: votesFor,
      members,
    };
  });
}

/** The creator is the first member. Callers make sure `cookieId` belongs to a signed-in account. */
export async function createBoard(cookieId: string, name: string, city: { id: string; name: string; currency: string }, firstEventId?: string): Promise<Board> {
  const userId = await userIdFor(cookieId);
  const id = newId();
  await db().batch([
    db().insert(boards).values({ id, name: name.trim().slice(0, 60) || "Our plans", ownerUserId: userId, city: city.id, cityName: city.name, currency: city.currency }),
    db().insert(boardParticipants).values({ id: newId(), boardId: id, userId }),
    ...(firstEventId ? [db().insert(boardItems).values({ id: newId(), boardId: id, eventId: firstEventId, addedByUserId: userId })] : []),
  ]);
  return (await loadBoards([id]))[0];
}

export async function getBoard(id: string): Promise<Board | null> {
  return (await loadBoards([id]))[0] ?? null;
}

/** Boards this account is a member of. */
export async function listBoards(cookieId: string): Promise<Board[]> {
  const userId = await userIdFor(cookieId);
  const ids = await db().selectDistinct({ id: boardParticipants.boardId }).from(boardParticipants).where(eq(boardParticipants.userId, userId));
  return loadBoards(ids.map((r) => r.id));
}

export type BoardAction =
  | { action: "join" }
  | { action: "leave" }
  | { action: "add"; eventId: string }
  | { action: "remove"; eventId: string }
  | { action: "vote"; eventId: string; on: boolean }
  | { action: "rename"; name: string }
  | { action: "me"; me: { budgetMax?: number; from?: string; to?: string } };

export type BoardActionResult = { ok: true; board: Board } | { ok: false; reason: "not-found" | "not-member" | "owner-cant-leave" };

/** One change per call, each a single-row write. Everything except "join" requires membership. */
export async function applyBoardAction(id: string, cookieId: string, a: BoardAction): Promise<BoardActionResult> {
  const [b] = await db().select({ currency: boards.currency, ownerUserId: boards.ownerUserId }).from(boards).where(eq(boards.id, id));
  if (!b) return { ok: false, reason: "not-found" };
  const userId = await userIdFor(cookieId);
  const d = db();
  if (a.action === "join") {
    await d.insert(boardParticipants).values({ id: newId(), boardId: id, userId }).onConflictDoNothing();
    return { ok: true, board: (await getBoard(id))! };
  }
  const [member] = await d.select({ id: boardParticipants.id }).from(boardParticipants).where(and(eq(boardParticipants.boardId, id), eq(boardParticipants.userId, userId)));
  if (!member) return { ok: false, reason: "not-member" };
  switch (a.action) {
    case "leave":
      if (b.ownerUserId === userId) return { ok: false, reason: "owner-cant-leave" };
      await d.batch([d.delete(boardVotes).where(and(eq(boardVotes.boardId, id), eq(boardVotes.userId, userId))), d.delete(boardParticipants).where(eq(boardParticipants.id, member.id))]);
      break;
    case "add":
      await d.insert(boardItems).values({ id: newId(), boardId: id, eventId: a.eventId, addedByUserId: userId }).onConflictDoNothing();
      break;
    case "remove":
      await d.batch([d.delete(boardItems).where(and(eq(boardItems.boardId, id), eq(boardItems.eventId, a.eventId))), d.delete(boardVotes).where(and(eq(boardVotes.boardId, id), eq(boardVotes.eventId, a.eventId)))]);
      break;
    case "vote":
      if (a.on) await d.insert(boardVotes).values({ id: newId(), boardId: id, eventId: a.eventId, userId }).onConflictDoNothing();
      else await d.delete(boardVotes).where(and(eq(boardVotes.boardId, id), eq(boardVotes.eventId, a.eventId), eq(boardVotes.userId, userId)));
      break;
    case "rename":
      await d.update(boards).set({ name: a.name, updatedAt: nowIso() }).where(eq(boards.id, id));
      break;
    case "me": {
      const me = { ...a.me };
      if (me.from && me.to && me.from > me.to) [me.from, me.to] = [me.to, me.from];
      await d.update(boardParticipants).set({ budgetMax: toDbAmountOrNull(me.budgetMax, b.currency), dateFrom: me.from ?? null, dateTo: me.to ?? null, updatedAt: nowIso() }).where(eq(boardParticipants.id, member.id));
      break;
    }
  }
  return { ok: true, board: (await getBoard(id))! };
}
