/**
 * Catalog access: sample events (static file) plus organizer-created events (store).
 * Sold counts combine sample seed sales with demo reservations recorded in the store.
 */
import "server-only";
import { z } from "zod";
import catalogJson from "../../../data/catalog.json";
import restaurantsJson from "../../../data/restaurants.json";
import { EventSchema, FeeRuleSchema, OrganizerSchema, type OfferEvent, type Organizer, type SoldMap, type FeeRule } from "@/lib/events";
import { LAYOUTS, seededTaken } from "@/lib/seating";
import { getDoc, listDocs, store } from "./store";

const SAMPLE_EVENTS: OfferEvent[] = z.array(EventSchema).parse(catalogJson.events);
const SAMPLE_ORGANIZERS: Organizer[] = z.array(OrganizerSchema).parse(catalogJson.organizers);
const CITY_FEES = z.record(z.string(), z.object({ fee: FeeRuleSchema, timezone: z.string(), currency: z.string() })).parse(catalogJson.cities);

export const SEASON = catalogJson.season;

export const RestaurantSchema = z.object({
  id: z.string(), name: z.string(), cityId: z.string(), area: z.string(), lat: z.number(), lng: z.number(),
  costPerPerson: z.number(), currency: z.string(), opens: z.string(), closes: z.string(), tags: z.array(z.string()), image: z.string(),
});
export type Restaurant = z.infer<typeof RestaurantSchema>;
export const RESTAURANTS: Restaurant[] = z.array(RestaurantSchema).parse(restaurantsJson.restaurants);

/** Fee rule by city; organizer events in other cities default to a plain 5% demo fee. */
export function feeRuleFor(cityId: string): FeeRule {
  return CITY_FEES[cityId]?.fee ?? { rate: 0.05, taxRate: 0, taxName: null };
}

/** Cities that currently have published inventory. */
export async function citiesWithInventory(): Promise<Set<string>> {
  const all = await allEvents();
  return new Set(all.filter((e) => e.status === "published").map((e) => e.cityId));
}

export async function organizerEvents(): Promise<OfferEvent[]> {
  return listDocs<OfferEvent>("events");
}

export async function allEvents(): Promise<OfferEvent[]> {
  return [...SAMPLE_EVENTS, ...(await organizerEvents())];
}

export async function publishedEvents(cityId?: string) {
  return (await allEvents()).filter((e) => e.status === "published" && (!cityId || e.cityId === cityId));
}

export async function getEvent(id: string): Promise<OfferEvent | null> {
  return SAMPLE_EVENTS.find((e) => e.id === id) ?? (await getDoc<OfferEvent>("events", id));
}

export async function getOrganizer(id: string): Promise<Organizer | null> {
  return SAMPLE_ORGANIZERS.find((o) => o.id === id) ?? (await getDoc<Organizer>("organizers", id));
}
export const sampleOrganizers = () => SAMPLE_ORGANIZERS;

/** Demo reservations per tier for a session, stored as one counter document. */
export const reservedKey = (sessionId: string) => `reserved:${sessionId}`;

export async function soldMapFor(event: OfferEvent, sessionId: string): Promise<SoldMap> {
  const session = event.sessions.find((s) => s.id === sessionId);
  if (!session) return {};
  const reserved = (await store().get<Record<string, number>>(reservedKey(sessionId))) ?? {};
  return Object.fromEntries(session.tiers.map((t) => [t.id, t.seedSold + (reserved[t.id] ?? 0)]));
}

export const seatMapKey = (sessionId: string) => `seatmap:${sessionId}`;

/** Seats unavailable for a reserved-seating session: deterministic seed sales + demo reservations. */
export async function takenSeats(event: OfferEvent, sessionId: string): Promise<Set<string>> {
  const layout = event.seatLayout ? LAYOUTS[event.seatLayout] : null;
  const session = event.sessions.find((s) => s.id === sessionId);
  if (!layout || !session) return new Set();
  const taken = new Set<string>();
  for (const t of session.tiers) for (const seat of seededTaken(session.id, layout, t.name, t.seedSold)) taken.add(seat);
  for (const seat of Object.keys((await store().get<Record<string, string>>(seatMapKey(sessionId))) ?? {})) taken.add(seat);
  return taken;
}

/** Sold maps for many sessions at once (one round trip). */
export async function soldMaps(events: OfferEvent[]): Promise<Record<string, SoldMap>> {
  const sessions = events.flatMap((e) => e.sessions);
  const reserved = await store().mget<Record<string, number>>(sessions.map((s) => reservedKey(s.id)));
  return Object.fromEntries(
    sessions.map((s, i) => [s.id, Object.fromEntries(s.tiers.map((t) => [t.id, t.seedSold + (reserved[i]?.[t.id] ?? 0)]))]),
  );
}
