import { describe, expect, it } from "vitest";
import { remaining } from "@/lib/events";
import { getEvent, soldMapFor } from "./catalog";
import { ReservationError, cancelReservation, createReservation, getReservation, listReservations } from "./reservations";
import { savedIds, setSaved } from "./saved";

const EVENT = "pottery-wheel-basics";

async function firstSession() {
  const e = (await getEvent(EVENT))!;
  const s = e.sessions.find((x) => x.start > "2026-12-01")!;
  return { e, s, tier: s.tiers[0] };
}

describe("reservations", () => {
  it("creates once per idempotency key and records totals", async () => {
    const { s, tier } = await firstSession();
    const input = { eventId: EVENT, sessionId: s.id, tierId: tier.id, quantity: 2, idempotencyKey: "idem-key-0001" };
    const a = await createReservation("u1", input);
    const b = await createReservation("u1", input);
    expect(b.duplicate).toBe(true);
    expect(b.reservation.id).toBe(a.reservation.id);
    expect(a.reservation.total).toBe(a.reservation.subtotal + a.reservation.fees);
    expect(a.reservation.status).toBe("reserved");
  });

  it("never oversells under concurrent requests", async () => {
    const { e, s, tier } = await firstSession();
    const left = remaining(tier, await soldMapFor(e, s.id));
    const results = await Promise.allSettled(Array.from({ length: left + 5 }, (_, i) => createReservation(`u-c${i}`, { eventId: EVENT, sessionId: s.id, tierId: tier.id, quantity: 1, idempotencyKey: `conc-${i}-xxxxxx` })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(left);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected.every((r) => r.reason instanceof ReservationError)).toBe(true);
    expect(remaining(tier, await soldMapFor(e, s.id))).toBe(0);
  });

  it("cancelling releases seats and is private to the owner", async () => {
    const { e, s, tier } = await firstSession();
    const before = remaining(tier, await soldMapFor(e, s.id));
    const mine = (await listReservations("u1"))[0];
    expect(await getReservation("someone-else", mine.id)).toBeNull();
    await cancelReservation("u1", mine.id);
    expect(remaining(tier, await soldMapFor(e, s.id))).toBe(before + mine.quantity);
    expect((await getReservation("u1", mine.id))?.status).toBe("cancelled");
  });

  it("rejects past sessions and over-quantity requests", async () => {
    const e = (await getEvent(EVENT))!;
    const past = e.sessions[0];
    await expect(createReservation("u2", { eventId: EVENT, sessionId: past.id, tierId: past.tiers[0].id, quantity: 1, idempotencyKey: "past-key-0001" })).rejects.toThrow(/started/);
    const { s } = await firstSession();
    const other = e.sessions.find((x) => x.start > s.start)!;
    await expect(createReservation("u2", { eventId: EVENT, sessionId: other.id, tierId: other.tiers[0].id, quantity: 10, idempotencyKey: "big-key-00001" })).rejects.toThrow(/left/);
  });

  it("keeps saved events across reads (refresh-safe)", async () => {
    await setSaved("u3", "jazz-at-the-attic", true);
    await setSaved("u3", "board-game-night", true);
    await setSaved("u3", "board-game-night", false);
    expect([...(await savedIds("u3"))]).toEqual(["jazz-at-the-attic"]);
  });
});

describe("reserved seating", () => {
  const FILM = "dangal--talkies";
  it("books exact seats, rejects taken or wrong-section seats, and frees them on cancel", async () => {
    const { getEvent: get, takenSeats } = await import("./catalog");
    const e = (await get(FILM))!;
    const s = e.sessions.find((x) => x.start > "2026-10-30")!;
    const prime = s.tiers.find((t) => t.name === "Prime")!;
    const taken = await takenSeats(e, s.id);
    const free = ["D", "E", "F", "G", "H"].flatMap((r) => Array.from({ length: 18 }, (_, i) => `${r}${i + 1}`)).filter((x) => !taken.has(x)).slice(0, 2);
    const { reservation } = await createReservation("viewer", { eventId: FILM, sessionId: s.id, tierId: prime.id, quantity: 2, seats: free, idempotencyKey: "seat-key-00001" });
    expect(reservation.seats).toEqual([...free].sort((a, b) => a.localeCompare(b, "en", { numeric: true })));
    expect((await takenSeats(e, s.id)).has(free[0])).toBe(true);
    await expect(createReservation("other", { eventId: FILM, sessionId: s.id, tierId: prime.id, quantity: 1, seats: [free[0]], idempotencyKey: "seat-key-00002" })).rejects.toThrow(/just taken/);
    await expect(createReservation("other", { eventId: FILM, sessionId: s.id, tierId: prime.id, quantity: 1, seats: ["A1"], idempotencyKey: "seat-key-00003" })).rejects.toThrow(/Classic|taken/);
    await expect(createReservation("other", { eventId: FILM, sessionId: s.id, tierId: prime.id, quantity: 2, seats: [free[1]], idempotencyKey: "seat-key-00004" })).rejects.toThrow(/Choose 2 seats/);
    await cancelReservation("viewer", reservation.id);
    expect((await takenSeats(e, s.id)).has(free[0])).toBe(false);
  });
});
