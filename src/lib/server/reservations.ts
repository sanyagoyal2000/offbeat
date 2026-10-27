/**
 * Demo reservations. No payment is taken and no real inventory is held: a reservation records
 * intent (a "held" booking) and claims seats in this app's own ticket tiers. Overselling is
 * prevented by the database (see src/lib/server/db/bookings.ts), not by application locks.
 */
import "server-only";
import { z } from "zod";
import { cheapestTier, remaining, type OfferEvent } from "@/lib/events";
import { feeLabel, orderCost } from "@/lib/pricing";
import { nowIn } from "@/lib/tz";
import { LAYOUTS, checkSeats } from "@/lib/seating";
import { track } from "./analytics";
import { feeRuleFor, getEvent, soldMapFor, takenSeats } from "./catalog";
import * as repo from "./db/bookings";
import { loadEvents } from "./db/catalog";

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

function toReservation(b: repo.BookingRow, event: OfferEvent | undefined, uid: string): Reservation {
  const session = event?.sessions.find((s) => s.id === b.sessionId);
  const tier = session?.tiers.find((t) => t.id === b.tierId);
  return {
    id: b.id,
    uid,
    status: b.status === "cancelled" ? "cancelled" : "reserved",
    createdAt: b.createdAt,
    ...(b.cancelledAt ? { cancelledAt: b.cancelledAt } : {}),
    eventId: b.eventId,
    sessionId: b.sessionId,
    tierId: b.tierId,
    eventTitle: event?.title ?? "Event removed",
    category: event?.category ?? "",
    image: event?.image ?? "",
    venue: event?.venue ?? { name: "", area: "", lat: 0, lng: 0 },
    cityId: event?.cityId ?? "",
    timezone: event?.timezone ?? "UTC",
    start: session?.start ?? "",
    end: session?.end ?? "",
    tierName: tier?.name ?? "",
    quantity: b.qty,
    currency: b.currency,
    unitPrice: b.unitPrice,
    feePerTicket: b.feePerTicket,
    subtotal: b.subtotal,
    fees: b.fees,
    total: Math.round((b.subtotal + b.fees) * 100) / 100,
    feeLabel: b.feeLabel,
    ...(b.promoJson ? { promoAttribution: JSON.parse(b.promoJson) as Reservation["promoAttribution"] } : {}),
    ...(b.seats.length ? { seats: b.seats } : {}),
  };
}

async function hydrate(rows: repo.BookingRow[], uid: string): Promise<Reservation[]> {
  const events = new Map((await loadEvents({ ids: [...new Set(rows.map((r) => r.eventId))] })).map((e) => [e.id, e]));
  return rows.map((r) => toReservation(r, events.get(r.eventId), uid));
}

export async function createReservation(
  uid: string,
  input: z.infer<typeof ReservationRequestSchema>,
  promo?: { experimentId: string; variantId: string },
): Promise<{ reservation: Reservation; duplicate: boolean }> {
  const event = await getEvent(input.eventId);
  if (!event || event.status !== "published") throw new ReservationError("This event isn't available.", "not-found");
  const session = event.sessions.find((x) => x.id === input.sessionId);
  if (!session || session.cancelled) throw new ReservationError("That date isn't available.", "unavailable");
  if (session.start <= nowIn(event.timezone)) throw new ReservationError("That session has already started.", "past");
  const tier = session.tiers.find((t) => t.id === input.tierId);
  if (!tier) throw new ReservationError("That ticket type isn't available.", "invalid");

  // Reserved seating: the exact seats must exist, be in this tier's section, and look free.
  // (The unique (session, seat) index is the final word if two people pick the same seat.)
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
  const result = await repo.book({
    cookieId: uid,
    eventId: event.id,
    sessionId: session.id,
    tierId: tier.id,
    qty: input.quantity,
    currency: event.currency,
    unitPrice: cost.unitPrice,
    feePerTicket: cost.feePerTicket,
    subtotal: cost.subtotal,
    fees: cost.fees,
    feeLabel: feeLabel(rule),
    idempotencyKey: input.idempotencyKey,
    promo,
    seats,
  });

  if (result.kind === "duplicate") return { reservation: (await hydrate([result.booking], uid))[0], duplicate: true };
  if (result.kind === "seat-taken") throw new ReservationError("Someone just took one of those seats. Pick different seats.", "sold-out");
  if (result.kind === "sold-out") {
    // The atomic UPDATE matched no row: explain with fresh counts.
    const sold = await soldMapFor(event, session.id);
    const left = remaining(tier, sold);
    if (left > 0) throw new ReservationError(`Only ${left} ${tier.name} ticket${left === 1 ? "" : "s"} left.`, "insufficient");
    const alt = cheapestTier(session, sold, input.quantity);
    throw new ReservationError(`${tier.name} just sold out.${alt ? ` ${alt.name} is still available.` : ""}`, "sold-out");
  }
  const reservation = toReservation(result.booking, event, uid);
  await track({ kind: "reservation", eventId: event.id, uid, source: "real", reservationId: reservation.id, ...promo });
  if (promo) await (await import("./experiments")).recordConversion(promo.experimentId, promo.variantId);
  return { reservation, duplicate: false };
}

export async function cancelReservation(uid: string, id: string): Promise<Reservation> {
  const b = await repo.cancel(uid, id);
  if (!b) throw new ReservationError("Reservation not found.", "not-found");
  return (await hydrate([b], uid))[0];
}

export async function getReservation(uid: string, id: string) {
  const b = await repo.getForUser(uid, id);
  return b ? (await hydrate([b], uid))[0] : null;
}

export async function listReservations(uid: string): Promise<Reservation[]> {
  return (await hydrate(await repo.listForUser(uid), uid)).sort((a, b) => a.start.localeCompare(b.start));
}

/** All reservations for events (organizer reporting). The visitor id is never exposed. */
export async function reservationsForEvents(eventIds: Set<string>) {
  return hydrate(await repo.listForEvents([...eventIds]), "");
}
