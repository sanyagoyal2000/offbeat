/**
 * Optional personalisation. Users' interests are Qloo entities they picked (or free-text notes,
 * which are never sent to Qloo). Ranking only orders events that already passed hard filters.
 *
 * Ranking uses up to three Insights calls, each restricted to our own catalog's mapped IDs:
 *   - films the catalog screens (direct mappings)          → filter.type=urn:entity:movie
 *   - "for fans of" artists (approximate audience proxies) → filter.type=urn:entity:artist
 *   - validated event tags                                  → filter.type=urn:tag
 * Positions are compared within a query only, never raw affinity across queries.
 */
import "server-only";
import mappingsJson from "../../../data/qloo-mappings.json";
import type { OfferEvent } from "@/lib/events";
import { QlooUnavailable, insightsEntities, insightsTags } from "./qloo";
import { store } from "./store";

export type Interest = { id: string; name: string; type: string; image?: string; detail?: string };
export type InterestNote = { text: string };
export type TasteProfile = { interests: Interest[]; notes: InterestNote[]; skipped?: boolean; updatedAt?: string };

const key = (uid: string) => `user:${uid}:taste`;
export const getTaste = async (uid: string): Promise<TasteProfile> => (await store().get<TasteProfile>(key(uid))) ?? { interests: [], notes: [] };
export async function saveTaste(uid: string, t: TasteProfile) {
  await store().set(key(uid), { ...t, updatedAt: new Date().toISOString() });
  if (t.interests.length) await store().sadd("idx:taste-users", uid);
  else await store().srem("idx:taste-users", uid);
}

type MappingEntry =
  | { match: "direct" | "approximate"; qlooId: string; qlooName: string; qlooType: string; note: string; ref: { name: string; type: string; relation?: string } }
  | { match: "unmatched"; note: string; ref: { name: string; type: string } };
const MAP = mappingsJson as unknown as { refs: Record<string, MappingEntry>; byEvent: Record<string, string[]> };

export type EventMapping = { qlooId: string; qlooName: string; qlooType: string; match: "direct" | "approximate"; note: string; relation?: string };

/** Mappings for an event. Organizer events use their stored mappings (if any). */
export function mappingsFor(e: Pick<OfferEvent, "id"> & { qlooMappings?: EventMapping[] }): EventMapping[] {
  if (e.qlooMappings) return e.qlooMappings;
  return (MAP.byEvent[e.id] ?? [])
    .map((k) => MAP.refs[k])
    .filter((m): m is Extract<MappingEntry, { qlooId: string }> => !!m && m.match !== "unmatched")
    .map((m) => ({ qlooId: m.qlooId, qlooName: m.qlooName, qlooType: m.qlooType, match: m.match, note: m.note, relation: m.ref.relation }));
}

export type TasteReason = { text: string; basis: "film" | "artist" | "tag"; approximate: boolean };
export type TasteRanking = {
  status: "ranked" | "no-interests" | "unavailable" | "no-coverage";
  /** eventId → position (0 = most relevant). Only ranked events appear. */
  rank: Map<string, number>;
  reasons: Map<string, TasteReason>;
  message?: string;
};

const pct = (i: number, n: number) => (n <= 1 ? 0 : i / (n - 1));

export async function rankByTaste(interests: Interest[], events: (OfferEvent & { qlooMappings?: EventMapping[] })[]): Promise<TasteRanking> {
  const empty = { rank: new Map(), reasons: new Map() };
  if (!interests.length) return { status: "no-interests", ...empty };
  const signal = interests.map((i) => i.id).join(",");
  const nameOf = new Map(interests.map((i) => [i.id, i.name]));

  const byType = { movie: new Map<string, string[]>(), artist: new Map<string, string[]>(), tag: new Map<string, string[]>() };
  const mapInfo = new Map<string, EventMapping>();
  for (const e of events) {
    for (const m of mappingsFor(e)) {
      const bucket = m.qlooType === "urn:entity:movie" ? byType.movie : m.qlooType === "urn:entity:artist" ? byType.artist : m.qlooType === "tag" ? byType.tag : null;
      if (!bucket) continue;
      bucket.set(m.qlooId, [...(bucket.get(m.qlooId) ?? []), e.id]);
      mapInfo.set(m.qlooId, m);
    }
  }
  if (!byType.movie.size && !byType.artist.size && !byType.tag.size) {
    return { status: "no-coverage", ...empty, message: "None of these events have taste data yet, so they're shown by date." };
  }

  // eventId → best (lowest) percentile, with a reason. Direct film matches win ties over approximations.
  const best = new Map<string, { p: number; reason: TasteReason }>();
  const offer = (eventId: string, p: number, reason: TasteReason) => {
    const prev = best.get(eventId);
    const adj = p + (reason.approximate ? 0.05 : 0);
    if (!prev || adj < prev.p) best.set(eventId, { p: adj, reason });
  };
  const because = (ex?: { entity_id: string; score: number }[]) => {
    const names = (ex ?? []).filter((x) => x.score >= 0.2 && nameOf.has(x.entity_id)).sort((a, b) => b.score - a.score).slice(0, 2).map((x) => nameOf.get(x.entity_id)!);
    return names.length ? names.join(" and ") : null;
  };

  let failures = 0;
  let attempts = 0;
  for (const [type, ids] of [["movie", byType.movie], ["artist", byType.artist]] as const) {
    if (!ids.size) continue;
    attempts++;
    try {
      const { entities } = await insightsEntities({
        "filter.type": `urn:entity:${type}`,
        "signal.interests.entities": signal,
        "filter.results.entities": [...ids.keys()].join(","),
        "feature.explainability": true,
        take: ids.size,
      });
      entities.forEach((ent, i) => {
        const m = mapInfo.get(ent.entity_id);
        const who = because(ent.query?.explainability?.["signal.interests.entities"]);
        for (const eventId of ids.get(ent.entity_id) ?? []) {
          const text =
            type === "movie"
              ? `Screens ${ent.name}${who ? `, which Qloo links to your interest in ${who}` : ""}`
              : `For fans of ${ent.name}${who ? `, whom Qloo links to ${who}` : ""} (approximate: the artist isn't performing)`;
          offer(eventId, pct(i, entities.length), { text, basis: type === "movie" ? "film" : "artist", approximate: m?.match === "approximate" });
        }
      });
    } catch (e) {
      if (!(e instanceof QlooUnavailable)) throw e;
      failures++;
    }
  }
  if (byType.tag.size) {
    attempts++;
    try {
      const tags = await insightsTags({ "signal.interests.entities": signal, "filter.results.tags": [...byType.tag.keys()].join(","), take: byType.tag.size });
      tags.forEach((t, i) => {
        const id = t.tag_id ?? t.id ?? "";
        const m = mapInfo.get(id);
        for (const eventId of byType.tag.get(id) ?? []) {
          offer(eventId, pct(i, tags.length), { text: `Tagged “${(m?.qlooName ?? t.name).trim()}”, a style Qloo associates with your interests`, basis: "tag", approximate: m?.match === "approximate" });
        }
      });
    } catch (e) {
      if (!(e instanceof QlooUnavailable)) throw e;
      failures++;
    }
  }
  if (attempts > 0 && failures === attempts) {
    return { status: "unavailable", ...empty, message: "Taste ranking is unavailable right now, so events are shown by date." };
  }
  const ordered = [...best.entries()].sort((a, b) => a[1].p - b[1].p);
  return {
    status: ordered.length ? "ranked" : "no-coverage",
    rank: new Map(ordered.map(([id], i) => [id, i])),
    reasons: new Map(ordered.map(([id, v]) => [id, v.reason])),
    message: ordered.length ? undefined : "Qloo didn't return taste data for these events, so they're shown by date.",
  };
}

/** "Your vibe" tags from Qloo, limited to genre tags so restaurant/review tags don't leak in. */
export async function vibeTags(interests: Interest[]): Promise<{ status: "ok" | "unavailable" | "none"; tags: string[] }> {
  if (!interests.length) return { status: "none", tags: [] };
  try {
    const signal = interests.map((i) => i.id).join(",");
    // One query per tag type (the API takes a single type here); results merged in order.
    // Film/book genre tags only when the person added a film, show or book.
    const wantsMedia = interests.some((i) => ["movie", "book", "tv_show"].includes(i.type));
    const [music, media] = await Promise.all([
      insightsTags({ "signal.interests.entities": signal, "filter.tag.types": "urn:tag:genre:music", take: 5 }),
      wantsMedia ? insightsTags({ "signal.interests.entities": signal, "filter.tag.types": "urn:tag:genre:media", take: 5 }) : Promise.resolve([]),
    ]);
    const tags = [...music.slice(0, 4), ...media.slice(0, 3)];
    const names = [...new Set(tags.map((t) => t.name.replace(/["]/g, "").trim()).filter((n) => n.length > 1))].map((n) => n[0].toUpperCase() + n.slice(1).toLowerCase());
    return { status: names.length ? "ok" : "none", tags: names.slice(0, 6) };
  } catch (e) {
    if (e instanceof QlooUnavailable) return { status: "unavailable", tags: [] };
    throw e;
  }
}
