/**
 * Audience suggestions for organizers. Qloo supplies cultural connections; the audience itself is
 * Offbeat visitors who explicitly opted in to being counted. No contact details are exposed and
 * reach is limited to Offbeat's own in-app promotion cards.
 */
import "server-only";
import type { OfferEvent } from "@/lib/events";
import { getConnected, saveConnected } from "./db/qloo";
import { countOptedIn, optedInAnchorSets } from "./db/users";
import { QlooUnavailable, insightsEntities } from "./qloo";
import { mappingsFor, type Interest } from "./taste";

export type AudienceEstimate = {
  status: "ok" | "no-mappings" | "unavailable" | "no-optins";
  optedIn: number;
  connected: number;
  connectedInterests: string[];
  connectedIds: string[];
  explanation: string;
};

const TYPE_URN: Record<string, string> = { artist: "urn:entity:artist", movie: "urn:entity:movie", book: "urn:entity:book", place: "urn:entity:place", tv_show: "urn:entity:tv_show" };

export async function audienceFor(event: OfferEvent): Promise<AudienceEstimate> {
  const mappings = mappingsFor(event);
  // One anonymous anchor set per opted-in visitor (no names, ids or contact details).
  const [sets, optedIn] = await Promise.all([optedInAnchorSets(), countOptedIn()]);
  const tastes = sets.map((x) => ({ t: { interests: x.anchors as Interest[] } }));
  if (!mappings.length) return { status: "no-mappings", optedIn, connected: 0, connectedInterests: [], connectedIds: [], explanation: "This event has no Qloo-mapped references yet, so taste-based audiences can't be suggested. You can still promote to everyone exploring the city." };
  if (!optedIn) return { status: "no-optins", optedIn: 0, connected: 0, connectedInterests: [], connectedIds: [], explanation: "No Offbeat visitors have opted in to audience counts yet." };

  const byType = new Map<string, Interest[]>();
  for (const { t } of tastes) for (const i of t.interests) byType.set(i.type, [...(byType.get(i.type) ?? []).filter((x) => x.id !== i.id), i]);

  const entitySignal = mappings.filter((m) => m.qlooType.startsWith("urn:entity:")).map((m) => m.qlooId);
  const tagSignal = mappings.filter((m) => m.qlooType === "tag").map((m) => m.qlooId);
  const connected = new Set<string>();
  try {
    for (const [type, interests] of byType) {
      const urn = TYPE_URN[type];
      if (!urn || !interests.length) continue;
      const { entities } = await insightsEntities({
        "filter.type": urn,
        ...(entitySignal.length ? { "signal.interests.entities": entitySignal.join(",") } : { "signal.interests.tags": tagSignal.join(",") }),
        "filter.results.entities": interests.map((i) => i.id).join(","),
        take: interests.length,
      });
      // Positional cut-off within this query (top half), not a calibrated probability.
      entities.slice(0, Math.max(1, Math.ceil(entities.length / 2))).forEach((e) => connected.add(e.entity_id));
    }
  } catch (e) {
    if (e instanceof QlooUnavailable) return { status: "unavailable", optedIn, connected: 0, connectedInterests: [], connectedIds: [], explanation: "Qloo is unavailable right now, so taste-based audience estimates can't be computed." };
    throw e;
  }
  const people = tastes.filter(({ t }) => t.interests.some((i) => connected.has(i.id)));
  const names = [...new Set(tastes.flatMap(({ t }) => t.interests).filter((i) => connected.has(i.id)).map((i) => i.name))].slice(0, 6);
  await saveConnected(event.id, [...connected]);
  return {
    status: "ok",
    optedIn,
    connected: people.length,
    connectedInterests: names,
    connectedIds: [...connected],
    explanation: `${people.length} of ${optedIn} opted-in Offbeat visitors have interests that Qloo ranks in the top half of connections to this event's references (${mappings.map((m) => m.qlooName).join(", ")}). Reach is limited to Offbeat's in-app promotion cards; Qloo provides cultural associations, not a contact list.`,
  };
}

/** Cached connected-interest ids used to decide whether a visitor is in a "connected" audience. */
export async function connectedIds(eventId: string): Promise<Set<string> | null> {
  const ids = await getConnected(eventId);
  return ids ? new Set(ids) : null;
}
