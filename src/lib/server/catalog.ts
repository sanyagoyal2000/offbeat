/**
 * Catalog access (database-backed via src/lib/server/db/catalog.ts). Sample and organizer events
 * share one table; `source` tells them apart. Sold counts come from ticket_tiers.sold, which only
 * the atomic booking UPDATE changes.
 */
import "server-only";
import { cache } from "react";
import type { FeeRule, OfferEvent, Organizer, SoldMap } from "@/lib/events";
import { CITY_FEES } from "@/lib/fees";
import { LAYOUTS, seededTaken } from "@/lib/seating";
import * as repo from "./db/catalog";

export type Restaurant = repo.Restaurant;

/** Fee rule by city; organizer events in other cities default to a plain 5% demo fee. */
export function feeRuleFor(cityId: string): FeeRule {
  return CITY_FEES[cityId] ?? { rate: 0.05, taxRate: 0, taxName: null };
}

/** Cities that currently have published inventory. */
export const citiesWithInventory = cache(() => repo.citiesWithPublishedEvents());

export const allEvents = cache(() => repo.loadEvents());

export const publishedEvents = cache((cityId?: string) => repo.loadEvents({ status: "published", city: cityId }));

export const eventsByOrganizer = (organizerId: string) => repo.loadEvents({ organizerId });

export const getEvent = cache((id: string) => repo.getEventById(id));

export async function getOrganizer(id: string): Promise<Organizer | null> {
  return repo.getOrganizerById(id);
}
export const sampleOrganizers = () => repo.listSampleOrganizers();

export const restaurantsIn = (cityId?: string) => repo.listRestaurants(cityId);

/** Fresh sold counts for one session (bypasses the load-time snapshot). */
export async function soldMapFor(_event: OfferEvent, sessionId: string): Promise<SoldMap> {
  return repo.soldForSession(sessionId);
}

/** Seats unavailable for a reserved-seating session: deterministic sample pre-sales + booked seats. */
export async function takenSeats(event: OfferEvent, sessionId: string): Promise<Set<string>> {
  const layout = event.seatLayout ? LAYOUTS[event.seatLayout] : null;
  const session = event.sessions.find((s) => s.id === sessionId);
  if (!layout || !session) return new Set();
  const taken = new Set<string>();
  for (const t of session.tiers) for (const seat of seededTaken(session.id, layout, t.name, t.seedSold)) taken.add(seat);
  for (const seat of await repo.bookedSeatIds(sessionId)) taken.add(seat);
  return taken;
}

/** Sold maps for many sessions at once (no extra round trip for events loaded in this request). */
export async function soldMaps(events: OfferEvent[]): Promise<Record<string, SoldMap>> {
  return repo.soldFor(events);
}

/** Seats reserved through bookings per session → tier (excludes sample pre-sales). */
export const reservedByTier = (sessionIds: string[]) => repo.reservedByTier(sessionIds);

export const saveEventRecord = (e: OfferEvent) => repo.saveEvent(e);
export const upsertOrganizer = repo.upsertOrganizer;
