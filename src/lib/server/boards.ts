/**
 * Shared planning boards. Anyone with the link can view, add events, vote and add optional
 * constraints (name, budget, dates). Shared only when the store is shared (file/redis);
 * in memory mode the UI labels boards as a preview.
 */
import "server-only";
import { z } from "zod";
import { combineConstraints } from "@/lib/group";
import { getDoc, newId, putDoc, store } from "./store";

export const ParticipantSchema = z.object({
  name: z.string().trim().max(40).optional(),
  budgetMax: z.number().nonnegative().max(1_000_000).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type Board = {
  id: string;
  name: string;
  ownerUid: string;
  cityId: string;
  cityName: string;
  currency: string;
  createdAt: string;
  items: { eventId: string; addedBy: string; addedAt: string }[];
  /** eventId → uids who voted for it */
  votes: Record<string, string[]>;
  participants: Record<string, z.infer<typeof ParticipantSchema> & { joinedAt: string }>;
};

const userBoards = (uid: string) => `user:${uid}:boards`;

export async function createBoard(uid: string, name: string, city: { id: string; name: string; currency: string }, firstEventId?: string) {
  const now = new Date().toISOString();
  const board: Board = {
    id: newId("board"),
    name: name.trim().slice(0, 60) || "Our plans",
    ownerUid: uid,
    cityId: city.id,
    cityName: city.name,
    currency: city.currency,
    createdAt: now,
    items: firstEventId ? [{ eventId: firstEventId, addedBy: uid, addedAt: now }] : [],
    votes: {},
    participants: { [uid]: { joinedAt: now } },
  };
  await putDoc("boards", board);
  await store().sadd(userBoards(uid), board.id);
  return board;
}

export const getBoard = (id: string) => getDoc<Board>("boards", id);

/** All edits go through a per-board lock so concurrent votes don't overwrite each other. */
export async function updateBoard(id: string, uid: string, fn: (b: Board) => void): Promise<Board | null> {
  return store().lock(`board:${id}`, async () => {
    const b = await getBoard(id);
    if (!b) return null;
    if (!b.participants[uid]) b.participants[uid] = { joinedAt: new Date().toISOString() };
    fn(b);
    await putDoc("boards", b);
    await store().sadd(userBoards(uid), id);
    return b;
  });
}

export async function listBoards(uid: string): Promise<Board[]> {
  const ids = await store().smembers(userBoards(uid));
  return (await store().mget<Board>(ids.map((i) => `boards:${i}`))).filter((b): b is Board => !!b).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const groupConstraints = (b: Board) => combineConstraints(Object.values(b.participants));
