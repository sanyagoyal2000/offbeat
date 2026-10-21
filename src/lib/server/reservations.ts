/**
 * Demo reservations. No payment is taken and no real inventory is held: a reservation records
 * intent and decrements this app's own seat counts so the demo can't oversell.
 */
import "server-only";
import { z } from "zod";
import { cheapestTier, remaining, type OfferEvent } from "@/lib/events";
import { feeLabel, orderCost } from "@/lib/pricing";
import { nowIn } from "@/lib/tz";
import { track } from "./analytics";
import { LAYOUTS, checkSeats } from "@/lib/seating";
import { feeRuleFor, getEvent, reservedKey, seatMapKey, soldMapFor, takenSeats } from "./catalog";
import { getDoc, newId, putDoc, store } from "./store";

export const MAX_TICKETS_PER_ORDER = 10;

export const ReservationRequestSchema = z.object({
  eventId: z.string(),
  sessionId: z.string(),
  tierId: z.string(),
  quantity: z.number().int().min(1).max(MAX_TICKETS_PER_ORDER),
  idempotencyKey: z.string().min(8).max(80),
  /** Required for reserved-seating events: exactly `quantity` seat ids, e.g. ["F7", "F8"]. */
  seats: z.array(z.string().regex(/^[A-Z]\d{1,2}$/)).max(MAX_TICKETS_PER_ORDER).optional(),
});

export type Reservation = {
  id: string;
  uid: string;
  status: "reserved" | "cancelled";
  createdAt: string;
  cancelledAt?: string;
  eventId: string;
  sessionId: string;
  tierId: string;
  eventTitle: string;
  category: string;
  image: string;
  venue: OfferEvent["venue"];
  cityId: string;
  timezone: string;
  start: string;
  end: string;
  tierName: string;
  quantity: number;
  currency: string;
  unitPrice: number;
  feePerTicket: number;
  subtotal: number;
  fees: number;
  total: number;
  feeLabel: string;
  promoAttribution?: { experimentId: string; variantId: string };
  seats?: string[];
};

export class ReservationError extends Error {
  constructor(
    message: string,
    public code: "not-found" | "unavailable" | "sold-out" | "insufficient" | "past" | "invalid",
  ) {
    super(message);
  }
}

const userIndex = (uid: string) => `user:${uid}:reservations`;

export async function createReservation(
  uid: string,
  input: z.infer<typeof ReservationRequestSchema>,
  promo?: { experimentId: string; variantId: string },
): Promise<{ reservation: Reservation; duplicate: boolean }> {
  const s = store();
  const idemKey = `idem:${uid}:${input.idempotencyKey}`;
  return s.lock(`inv:${input.sessionId}`, async () => {
    // A repeated submit (double tap, retry, refresh) returns the original reservation.
    const existingId = await s.get<string>(idemKey);
    if (existingId) {
      const existing = await getDoc<Reservation>("reservations", existingId);
      if (existing) return { reservation: existing, duplicate: true };
    }

    const event = await getEvent(input.eventId);
    if (!event || event.status !== "published") throw new ReservationError("This event isn't available.", "not-found");
    const session = event.sessions.find((x) => x.id === input.sessionId);
    if (!session || session.cancelled) throw new ReservationError("That date isn't available.", "unavailable");
    if (session.start <= nowIn(event.timezone)) throw new ReservationError("That session has already started.", "past");
    const tier = session.tiers.find((t) => t.id === input.tierId);
    if (!tier) throw new ReservationError("That ticket type isn't available.", "invalid");

    // Recheck availability inside the lock, right before writing.
    const sold = await soldMapFor(event, session.id);
    const left = remaining(tier, sold);
    if (left === 0) {
      const alt = cheapestTier(session, sold, input.quantity);
      throw new ReservationError(`${tier.name} just sold out.${alt ? ` ${alt.name} is still available.` : ""}`, "sold-out");
    }
    if (left < input.quantity) throw new ReservationError(`Only ${left} ${tier.name} ticket${left === 1 ? "" : "s"} left.`, "insufficient");

    // Reserved seating: the exact seats must exist, be in this tier's section, and still be free.
    let seats: string[] | undefined;
    if (event.seatLayout) {
      const layout = LAYOUTS[event.seatLayout];
      if (!input.seats || input.seats.length !== input.quantity) throw new ReservationError(`Choose ${input.quantity} seat${input.quantity === 1 ? "" : "s"}.`, "invalid");
      const check = checkSeats(layout, input.seats, await takenSeats(event, session.id));
      if (!check.ok) throw new ReservationError(check.error, "sold-out");
      if (check.section !== tier.name) throw new ReservationError(`Those seats are in ${check.section}, not ${tier.name}.`, "invalid");
      seats = [...input.seats].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
    }

    const rule = feeRuleFor(event.cityId);
    const cost = orderCost(tier.price, input.quantity, rule, event.currency);
    const reservation: Reservation = {
      id: newId("res"),
      uid,
      status: "reserved",
      createdAt: new Date().toISOString(),
      eventId: event.id,
      sessionId: session.id,
      tierId: tier.id,
      eventTitle: event.title,
      category: event.category,
      image: event.image,
      venue: event.venue,
      cityId: event.cityId,
      timezone: event.timezone,
      start: session.start,
      end: session.end,
      tierName: tier.name,
      currency: event.currency,
      ...cost,
      feeLabel: feeLabel(rule),
      promoAttribution: promo,
      seats,
    };
    const reserved = (await s.get<Record<string, number>>(reservedKey(session.id))) ?? {};
    reserved[tier.id] = (reserved[tier.id] ?? 0) + input.quantity;
    await s.set(reservedKey(session.id), reserved);
    if (seats) {
      const map = (await s.get<Record<string, string>>(seatMapKey(session.id))) ?? {};
      for (const seat of seats) map[seat] = reservation.id;
      await s.set(seatMapKey(session.id), map);
    }
    await putDoc("reservations", reservation);
    await s.sadd(userIndex(uid), reservation.id);
    await s.set(idemKey, reservation.id);
    await track({ kind: "reservation", eventId: event.id, uid, source: "real", reservationId: reservation.id, ...promo });
    if (promo) await (await import("./experiments")).recordConversion(promo.experimentId, promo.variantId);
    return { reservation, duplicate: false };
  });
}

export async function cancelReservation(uid: string, id: string): Promise<Reservation> {
  const r = await getDoc<Reservation>("reservations", id);
  if (!r || r.uid !== uid) throw new ReservationError("Reservation not found.", "not-found");
  if (r.status === "cancelled") return r;
  const s = store();
  return s.lock(`inv:${r.sessionId}`, async () => {
    const reserved = (await s.get<Record<string, number>>(reservedKey(r.sessionId))) ?? {};
    reserved[r.tierId] = Math.max(0, (reserved[r.tierId] ?? 0) - r.quantity);
    await s.set(reservedKey(r.sessionId), reserved);
    if (r.seats?.length) {
      const map = (await s.get<Record<string, string>>(seatMapKey(r.sessionId))) ?? {};
      for (const seat of r.seats) if (map[seat] === r.id) delete map[seat];
      await s.set(seatMapKey(r.sessionId), map);
    }
    const updated: Reservation = { ...r, status: "cancelled", cancelledAt: new Date().toISOString() };
    await putDoc("reservations", updated);
    return updated;
  });
}

export async function getReservation(uid: string, id: string) {
  const r = await getDoc<Reservation>("reservations", id);
  return r && r.uid === uid ? r : null;
}

export async function listReservations(uid: string): Promise<Reservation[]> {
  const ids = await store().smembers(userIndex(uid));
  const docs = await store().mget<Reservation>(ids.map((id) => `reservations:${id}`));
  return docs.filter((d): d is Reservation => !!d).sort((a, b) => a.start.localeCompare(b.start));
}

/** All reservations for events (organizer reporting). */
export async function reservationsForEvents(eventIds: Set<string>) {
  const { listDocs } = await import("./store");
  return (await listDocs<Reservation>("reservations")).filter((r) => eventIds.has(r.eventId));
}
