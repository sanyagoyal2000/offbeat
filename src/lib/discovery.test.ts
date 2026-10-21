import { describe, expect, it } from "vitest";
import catalog from "../../data/catalog.json";
import { discover, sortOffers, type DiscoveryFilter } from "./discovery";
import { EventSchema, type FeeRule, type OfferEvent, type SoldMap } from "./events";
import { bookingFee } from "./pricing";

const events: OfferEvent[] = catalog.events.map((e) => EventSchema.parse(e));
const fee = (id: string): FeeRule => (catalog.cities as Record<string, { fee: FeeRule }>)[id].fee;
const seedSold = (): Record<string, SoldMap> => Object.fromEntries(events.flatMap((e) => e.sessions.map((s) => [s.id, Object.fromEntries(s.tiers.map((t) => [t.id, t.seedSold]))])));
const base: DiscoveryFilter = { cityId: "bengaluru-in", nowLocal: "2026-10-20T12:00" };

describe("hard constraints", () => {
  it("only returns sessions inside the date range", () => {
    const r = { from: "2026-10-24", to: "2026-10-25" };
    const { offers } = discover(events, seedSold(), { ...base, range: r }, fee);
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) expect(o.session.start.slice(0, 10) >= r.from && o.session.start.slice(0, 10) <= r.to).toBe(true);
  });

  it("applies the budget including the booking fee", () => {
    const max = 1250; // Acoustic Sundowner: 1199 + 71 fee = 1270 > 1250, so it must be excluded
    const { offers } = discover(events, seedSold(), { ...base, maxPrice: max }, fee);
    expect(offers.some((o) => o.event.id === "acoustic-sundowner")).toBe(false);
    for (const o of offers) expect(o.fromPrice! + bookingFee(o.fromPrice!, fee(o.event.cityId), o.event.currency)).toBeLessThanOrEqual(max);
  });

  it("requires enough seats in one tier for the whole party", () => {
    const sold = seedSold();
    const pottery = events.find((e) => e.id === "pottery-wheel-basics")!;
    for (const s of pottery.sessions) sold[s.id] = { t1: s.tiers[0].capacity - 2 }; // 2 seats left everywhere
    expect(discover(events, sold, { ...base, keywords: ["pottery"], partySize: 2 }, fee).offers.some((o) => o.event.id === pottery.id)).toBe(true);
    const r3 = discover(events, sold, { ...base, keywords: ["pottery"], partySize: 3 }, fee);
    expect(r3.offers.some((o) => o.event.id === pottery.id)).toBe(false);
    expect(r3.dropped.party).toBeGreaterThan(0);
  });

  it("hides sold-out and past sessions, and stays within the city", () => {
    const { offers } = discover(events, seedSold(), { ...base, nowLocal: "2026-12-28T00:00" }, fee);
    expect(offers).toHaveLength(0);
    expect(discover(events, seedSold(), { ...base, cityId: "london-gb", nowLocal: "2026-10-20T12:00" }, fee).offers.every((o) => o.event.cityId === "london-gb")).toBe(true);
  });

  it("taste order can reorder but never re-admit filtered events", () => {
    const { offers } = discover(events, seedSold(), { ...base, category: "Music" }, fee);
    const rank = new Map([["pottery-wheel-basics", 0], [offers.at(-1)!.event.id, 1]]);
    const sorted = sortOffers(offers, "relevance", rank);
    expect(sorted[0].event.id).toBe(offers.at(-1)!.event.id);
    expect(sorted.some((o) => o.event.id === "pottery-wheel-basics")).toBe(false);
    expect(sorted).toHaveLength(offers.length);
  });
});
