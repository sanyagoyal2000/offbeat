/**
 * Bookings repository. Overselling is prevented by the database, not by application locks:
 * one transaction (a libSQL batch) runs
 *   UPDATE ticket_tiers SET sold = sold + :qty WHERE id = :tier AND sold + :qty <= capacity
 * and inserts the booking only `WHERE changes() = 1`, i.e. only if that UPDATE claimed the seats.
 * SQLite applies each UPDATE atomically, so two concurrent bookings for the last seat can't both win.
 * Reserved seats are rows in booked_seats with a unique (session_id, seat) index, inserted in the
 * same transaction, so a seat conflict rolls the whole booking back.
 */
import type { InStatement } from "@libsql/client";
import { and, desc, eq, inArray } from "drizzle-orm";
import { dbClient, db, newId, nowIso } from "./client";
import { fromDbAmount, toDbAmount } from "./money";
import { bookedSeats, bookings } from "./schema";
import { userIdFor } from "./users";

type Row = typeof bookings.$inferSelect;
/** A booking with amounts in ordinary currency units (converted from storage here). */
export type BookingRow = Omit<Row, "unitPriceAmount" | "feePerTicketAmount" | "ticketTotalAmount" | "feeAmount"> & { unitPrice: number; feePerTicket: number; subtotal: number; fees: number; seats: string[] };

export type NewBooking = {
  cookieId: string;
  eventId: string;
  sessionId: string;
  tierId: string;
  qty: number;
  currency: string;
  unitPrice: number;
  feePerTicket: number;
  subtotal: number;
  fees: number;
  feeLabel: string;
  idempotencyKey: string;
  promo?: unknown;
  seats?: string[];
};

export type BookResult = { kind: "booked"; booking: BookingRow } | { kind: "duplicate"; booking: BookingRow } | { kind: "sold-out" } | { kind: "seat-taken" };

const isUnique = (e: unknown, index: string) => String((e as Error)?.message ?? e).includes("UNIQUE") && String((e as Error)?.message ?? e).includes(index);

async function withSeats(rows: Row[]): Promise<BookingRow[]> {
  if (!rows.length) return [];
  const seats = await db().select({ bookingId: bookedSeats.bookingId, seat: bookedSeats.seat }).from(bookedSeats).where(inArray(bookedSeats.bookingId, rows.map((r) => r.id)));
  return rows.map(({ unitPriceAmount, feePerTicketAmount, ticketTotalAmount, feeAmount, ...r }) => ({
    ...r,
    unitPrice: fromDbAmount(unitPriceAmount, r.currency),
    feePerTicket: fromDbAmount(feePerTicketAmount, r.currency),
    subtotal: fromDbAmount(ticketTotalAmount, r.currency),
    fees: fromDbAmount(feeAmount, r.currency),
    seats: seats.filter((s) => s.bookingId === r.id).map((s) => s.seat).sort((a, b) => a.localeCompare(b, "en", { numeric: true })) }));
}

export async function findByIdempotencyKey(userId: string, key: string): Promise<BookingRow | null> {
  const rows = await db().select().from(bookings).where(and(eq(bookings.userId, userId), eq(bookings.idempotencyKey, key)));
  return (await withSeats(rows))[0] ?? null;
}

/** Claims seats and records the booking atomically. Never oversells; returns "sold-out" when the UPDATE matched no row. */
export async function book(b: NewBooking): Promise<BookResult> {
  const userId = await userIdFor(b.cookieId);
  const existing = await findByIdempotencyKey(userId, b.idempotencyKey);
  if (existing) return { kind: "duplicate", booking: existing };

  const id = newId();
  const at = nowIso();
  const stmts: InStatement[] = [
    { sql: "UPDATE ticket_tiers SET sold = sold + :qty, updated_at = :at WHERE id = :tier AND session_id = :session AND sold + :qty <= capacity", args: { qty: b.qty, tier: b.tierId, session: b.sessionId, at } },
    {
      sql: `INSERT INTO bookings (id, user_id, event_id, session_id, tier_id, qty, currency, unit_price_amount, fee_per_ticket_amount, ticket_total_amount, fee_amount, fee_label, status, idempotency_key, promo_json, created_at, updated_at)
            SELECT :id, :user, :event, :session, :tier, :qty, :currency, :unit, :feeEach, :ticketTotal, :fee, :feeLabel, 'held', :idem, :promo, :at, :at WHERE changes() = 1`,
      args: { id, user: userId, event: b.eventId, session: b.sessionId, tier: b.tierId, qty: b.qty, currency: b.currency, unit: toDbAmount(b.unitPrice, b.currency), feeEach: toDbAmount(b.feePerTicket, b.currency), ticketTotal: toDbAmount(b.subtotal, b.currency), fee: toDbAmount(b.fees, b.currency), feeLabel: b.feeLabel, idem: b.idempotencyKey, promo: b.promo ? JSON.stringify(b.promo) : null, at },
    },
    ...(b.seats ?? []).map((seat) => ({
      sql: "INSERT INTO booked_seats (id, session_id, seat, booking_id, created_at, updated_at) SELECT :sid, :session, :seat, :id, :at, :at WHERE EXISTS (SELECT 1 FROM bookings WHERE id = :id)",
      args: { sid: newId(), session: b.sessionId, seat, id, at },
    })),
    { sql: "SELECT count(*) AS n FROM bookings WHERE id = :id", args: { id } },
  ];
  try {
    const res = await dbClient().batch(stmts, "write");
    if (Number(res.at(-1)!.rows[0].n) === 0) return { kind: "sold-out" };
  } catch (e) {
    if (isUnique(e, "booked_seats")) return { kind: "seat-taken" };
    if (isUnique(e, "bookings")) {
      const dup = await findByIdempotencyKey(userId, b.idempotencyKey);
      if (dup) return { kind: "duplicate", booking: dup };
    }
    throw e;
  }
  const [row] = await withSeats(await db().select().from(bookings).where(eq(bookings.id, id)));
  return { kind: "booked", booking: row };
}

/** Cancels a booking and releases its seats in one transaction. Returns null if it isn't the user's. */
export async function cancel(cookieId: string, bookingId: string): Promise<BookingRow | null> {
  const userId = await userIdFor(cookieId);
  const at = nowIso();
  await dbClient().batch(
    [
      { sql: "UPDATE bookings SET status = 'cancelled', cancelled_at = :at, updated_at = :at WHERE id = :id AND user_id = :user AND status != 'cancelled'", args: { id: bookingId, user: userId, at } },
      // Only release seats if the line above actually cancelled something.
      { sql: "UPDATE ticket_tiers SET sold = sold - (SELECT qty FROM bookings WHERE id = :id), updated_at = :at WHERE id = (SELECT tier_id FROM bookings WHERE id = :id) AND changes() = 1", args: { id: bookingId, at } },
      { sql: "DELETE FROM booked_seats WHERE booking_id = :id AND (SELECT status FROM bookings WHERE id = :id) = 'cancelled'", args: { id: bookingId } },
    ],
    "write",
  );
  return getForUser(cookieId, bookingId);
}

export async function getForUser(cookieId: string, bookingId: string): Promise<BookingRow | null> {
  const userId = await userIdFor(cookieId);
  const rows = await db().select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.userId, userId)));
  return (await withSeats(rows))[0] ?? null;
}

export async function listForUser(cookieId: string): Promise<BookingRow[]> {
  const userId = await userIdFor(cookieId);
  return withSeats(await db().select().from(bookings).where(eq(bookings.userId, userId)).orderBy(desc(bookings.createdAt)));
}

/** Organizer reporting: bookings for these events (no personal data is exposed by callers). */
export async function listForEvents(eventIds: string[]): Promise<BookingRow[]> {
  if (!eventIds.length) return [];
  return withSeats(await db().select().from(bookings).where(inArray(bookings.eventId, eventIds)));
}
