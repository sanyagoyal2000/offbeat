import "server-only";
import { track } from "./analytics";
import { store } from "./store";

const key = (uid: string) => `user:${uid}:saved`;

export const savedIds = async (uid: string) => new Set(await store().smembers(key(uid)));

export async function setSaved(uid: string, eventId: string, saved: boolean) {
  if (saved) {
    const already = (await savedIds(uid)).has(eventId);
    await store().sadd(key(uid), eventId);
    if (!already) await track({ kind: "save", eventId, uid, source: "real" });
  } else await store().srem(key(uid), eventId);
}
