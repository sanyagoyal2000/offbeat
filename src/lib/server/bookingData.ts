import "server-only";
import { remaining, type OfferEvent } from "@/lib/events";
import { bookingFee, feeLabel } from "@/lib/pricing";
import { nowIn } from "@/lib/tz";
import { feeRuleFor, soldMaps, takenSeats } from "./catalog";

export type BookingSession = { id: string; start: string; end: string; tiers: { id: string; name: string; price: number; fee: number; left: number; capacity: number }[] };

/** Upcoming sessions with live seats left, for the booking flow. */
/** Taken seats for one session (reserved-seating events only). */
export async function sessionSeats(event: OfferEvent, sessionId: string) {
  return event.seatLayout ? [...(await takenSeats(event, sessionId))] : [];
}

export async function bookingSessions(event: OfferEvent): Promise<{ sessions: BookingSession[]; feeLabel: string; feeRule: ReturnType<typeof feeRuleFor> }> {
  const now = nowIn(event.timezone);
  const sold = await soldMaps([event]);
  const rule = feeRuleFor(event.cityId);
  return {
    feeLabel: feeLabel(rule),
    feeRule: rule,
    sessions: event.sessions
      .filter((s) => s.start > now && !s.cancelled)
      .map((s) => ({
        id: s.id,
        start: s.start,
        end: s.end,
        tiers: s.tiers.map((t) => ({ id: t.id, name: t.name, price: t.price, fee: bookingFee(t.price, rule, event.currency), left: remaining(t, sold[s.id] ?? {}), capacity: t.capacity })),
      })),
  };
}
