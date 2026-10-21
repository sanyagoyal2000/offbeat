import "server-only";
import { getDoc, newId, putDoc, delDoc, store } from "./store";

export type SavedSearch = { id: string; uid: string; label: string; query: string; cityId: string; cityName: string; createdAt: string };
const idx = (uid: string) => `user:${uid}:searches`;

export async function addSavedSearch(uid: string, s: Omit<SavedSearch, "id" | "uid" | "createdAt">) {
  const doc: SavedSearch = { ...s, id: newId("ss"), uid, createdAt: new Date().toISOString() };
  await putDoc("searches", doc);
  await store().sadd(idx(uid), doc.id);
  return doc;
}
export async function listSavedSearches(uid: string) {
  const ids = await store().smembers(idx(uid));
  return (await store().mget<SavedSearch>(ids.map((i) => `searches:${i}`))).filter((x): x is SavedSearch => !!x);
}
export async function removeSavedSearch(uid: string, id: string) {
  const d = await getDoc<SavedSearch>("searches", id);
  if (!d || d.uid !== uid) return;
  await delDoc("searches", id);
  await store().srem(idx(uid), id);
}
