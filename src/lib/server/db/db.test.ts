import { createClient } from "@libsql/client";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { clusterWishes } from "@/lib/wishes";
import { metricsFor, track } from "../analytics";
import { getEvent } from "../catalog";
import { ReservationError, createReservation } from "../reservations";
import { changeTitleLab, createTitleLab, runSimulation, titleLabPicks, titleLabReport, getTitleLab } from "../titleLab";
import { allWishes, createWish } from "../wishes";
import { book } from "./bookings";
import { TEST_DB_URL, db } from "./client";
import { bookings, ticketTiers, variantEvents } from "./schema";
import { seedDatabase } from "./seed";

const EVENT = "chai-and-chords-rooftop"; // a seeded local act: one tier per session

async function lastSeatSession() {
  const e = (await getEvent(EVENT))!;
  const s = e.sessions[1];
  const tier = s.tiers[0];
  // Leave exactly one seat.
  await db().update(ticketTiers).set({ sold: tier.capacity - 1 }).where(eq(ticketTiers.id, tier.id));
  return { e, s, tier };
}

describe("bookings never oversell", () => {
  it("two parallel bookings for the last seat: exactly one succeeds", async () => {
    const { s, tier } = await lastSeatSession();
    const attempt = (who: string) => createReservation(who, { eventId: EVENT, sessionId: s.id, tierId: tier.id, quantity: 1, idempotencyKey: `last-seat-${who}` });
    const results = await Promise.allSettled([attempt("buyer-a"), attempt("buyer-b")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected")!;
    expect(failed.reason).toBeInstanceOf(ReservationError);
    expect((failed.reason as ReservationError).code).toBe("sold-out");
    const [t] = await db().select().from(ticketTiers).where(eq(ticketTiers.id, tier.id));
    expect(t.sold).toBe(t.capacity);
    const [{ n }] = await db().select({ n: sql<number>`count(*)` }).from(bookings).where(eq(bookings.tierId, tier.id));
    expect(n).toBe(1);
  });

  it("holds across two separate database connections racing for the same seat", async () => {
    const { s, tier } = await lastSeatSession();
    // A second, independent connection to the same file runs the same guarded UPDATE.
    const other = createClient({ url: TEST_DB_URL });
    const rival = other.execute({ sql: "UPDATE ticket_tiers SET sold = sold + 1 WHERE id = ? AND sold + 1 <= capacity", args: [tier.id] });
    const mine = book({ cookieId: "racer", eventId: EVENT, sessionId: s.id, tierId: tier.id, qty: 1, currency: "INR", unitPrice: tier.price, feePerTicket: 0, subtotal: tier.price, fees: 0, feeLabel: "test", idempotencyKey: "race-two-conns" });
    const [r1, r2] = await Promise.all([rival, mine]);
    const claimed = r1.rowsAffected + (r2.kind === "booked" ? 1 : 0);
    expect(claimed).toBe(1);
    const [t] = await db().select().from(ticketTiers).where(eq(ticketTiers.id, tier.id));
    expect(t.sold).toBe(t.capacity);
    other.close();
  });
});

describe("wish aggregation", () => {
  it("counts only opted-in wishes and exposes no owner or free text", async () => {
    const loc = { cityId: "london-gb", cityName: "London", area: "Peckham", lat: 51.4741, lng: -0.0691, radiusKm: 5 };
    const base = { text: "My private note", category: "Kids" as const, keywords: ["puppets"], from: null, to: null, budgetMax: 15, currency: "GBP", location: loc, tasteRefs: [] };
    await createWish("parent-in", { ...base, notify: true });
    await createWish("parent-out", { ...base, notify: false });
    const pool = await allWishes("london-gb");
    const mine = pool.filter((w) => w.keywords.includes("puppets"));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ uid: "", text: "", notify: true, budgetMax: 15 });
    const cluster = clusterWishes(pool).find((c) => c.keyword === "puppets")!;
    expect(cluster.realCount).toBe(1);
  });
});

describe("simulated vs real metrics", () => {
  it("simulation rows never reach real Title lab or organizer metrics", async () => {
    const e = (await getEvent("acoustic-sundowner"))!;
    await createTitleLab(e, e.organizerId, { force: true });
    await changeTitleLab(e.id, e.organizerId, { action: "approve-all" });
    await titleLabPicks("real-visitor", [], [e], () => `/events/${e.id}`);
    await runSimulation(e.id, e.organizerId, 300);
    const lab = (await getTitleLab(e.id))!;
    expect(titleLabReport(lab).totalImpressions).toBe(1);
    const [{ simulated }] = await db().select({ simulated: sql<number>`count(*)` }).from(variantEvents).where(eq(variantEvents.isSimulated, true));
    expect(simulated).toBeGreaterThanOrEqual(300);

    await track({ kind: "view", eventId: e.id, uid: "", source: "simulated" });
    await track({ kind: "view", eventId: e.id, uid: "real-visitor", source: "real" });
    expect((await metricsFor(e.id)).view).toBe(1);
    expect((await metricsFor(e.id, "simulated")).view).toBe(1);
  });
});

describe("seed", () => {
  it("is idempotent and never resets sold counts", async () => {
    const tier = (await getEvent("bedroom-pop-evening"))!.sessions[0].tiers[0];
    await db().update(ticketTiers).set({ sold: 7 }).where(eq(ticketTiers.id, tier.id));
    const count = async () => (await db().all<{ e: number; s: number; t: number; l: number; w: number }>(sql`select (select count(*) from events) e, (select count(*) from event_sessions) s, (select count(*) from ticket_tiers) t, (select count(*) from event_qloo_links) l, (select count(*) from wishes) w`))[0];
    const before = await count();
    const report = await seedDatabase();
    expect(Object.values(report).every((r) => r.inserted === 0)).toBe(true);
    expect(await count()).toEqual(before);
    const [t] = await db().select().from(ticketTiers).where(eq(ticketTiers.id, tier.id));
    expect(t.sold).toBe(7);
    expect(report.events.total).toBe(63);
  });
});
