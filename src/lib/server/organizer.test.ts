import { describe, expect, it } from "vitest";
import { EventInputSchema, InventoryConflict, saveEvent, type EventInput } from "./organizer";
import { createReservation } from "./reservations";
import { createWish, myWishes } from "./wishes";

const input = (over: Partial<EventInput> = {}): EventInput =>
  EventInputSchema.parse({
    title: "Rooftop Acoustic Evenings",
    category: "Music",
    cityId: "bengaluru-in",
    summary: "A small acoustic set on a rooftop",
    description: "Two short acoustic sets by local songwriters on a quiet rooftop.",
    whatYoullDo: [],
    venue: { name: "The Terrace Room", area: "Indiranagar", lat: 12.9719, lng: 77.6412 },
    durationMin: 120,
    facts: {},
    show: { performers: ["Local songwriters"] },
    image: "/images/loft-folk.jpg",
    status: "published",
    sessions: [{ date: "2026-11-21", time: "19:00", tiers: [{ name: "General", price: 999, capacity: 10 }] }],
    ...over,
  });

describe("organizer events", () => {
  it("validates category-specific fields", () => {
    expect(EventInputSchema.safeParse({ ...input(), category: "Treks & outdoors", show: undefined }).success).toBe(false);
  });

  it("keeps inventory consistent with reservations", async () => {
    const { event } = await saveEvent("org_test", input());
    const s = event.sessions[0];
    await createReservation("buyer", { eventId: event.id, sessionId: s.id, tierId: s.tiers[0].id, quantity: 3, idempotencyKey: "org-test-key-1" });
    const base = { id: s.id, date: "2026-11-21", time: "19:00", tiers: [{ id: s.tiers[0].id, name: "General", price: 999, capacity: 2 }] };
    await expect(saveEvent("org_test", input({ sessions: [base] }), event.id)).rejects.toBeInstanceOf(InventoryConflict);
    await expect(saveEvent("org_test", input({ sessions: [{ ...base, time: "20:00", tiers: [{ ...base.tiers[0], capacity: 10 }] }] }), event.id)).rejects.toThrow(/can't change/);
    await expect(saveEvent("org_test", input({ sessions: [{ date: "2026-11-28", time: "19:00", tiers: [{ name: "General", price: 999, capacity: 10 }] }] }), event.id)).rejects.toThrow(/can't be deleted/);
    const ok = await saveEvent("org_test", input({ sessions: [{ ...base, cancelled: true, tiers: [{ ...base.tiers[0], capacity: 12 }] }] }), event.id);
    expect(ok.event.sessions[0].cancelled).toBe(true);
    await expect(saveEvent("someone-else", input(), event.id)).rejects.toThrow(/only edit/);
  });

  it("publishing a proposal reaches matching opted-in wishes only", async () => {
    const loc = { cityId: "bengaluru-in", cityName: "Bengaluru", area: "Indiranagar", lat: 12.9719, lng: 77.6412, radiusKm: 5 };
    const base = { text: "", category: "Music" as const, keywords: ["acoustic"], from: "2026-11-01", to: "2026-11-30", budgetMax: 1500, currency: "INR", location: loc, tasteRefs: [] };
    await createWish("fan", { ...base, notify: true });
    await createWish("private-fan", { ...base, notify: false });
    await createWish("cheap-fan", { ...base, budgetMax: 500, notify: true });
    const { proposals } = await saveEvent("org_test", input({ proposedForCluster: "bengaluru-in:Music:acoustic:x" }));
    expect(proposals?.matched).toBe(1);
    expect((await myWishes("fan"))[0].status).toBe("proposed");
    expect((await myWishes("private-fan"))[0].status).toBe("open");
    expect((await myWishes("cheap-fan"))[0].status).toBe("open");
  });
});
