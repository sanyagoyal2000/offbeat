import { describe, expect, it } from "vitest";
import catalog from "../../data/catalog.json";
import restaurants from "../../data/restaurants.json";
import { EventSchema, type FeeRule, type OfferEvent, type SoldMap } from "./events";
import { budgetPerPerson, openForDinner, plan, type PlanRequest } from "./planner";

const events: OfferEvent[] = catalog.events.map((e) => EventSchema.parse(e));
const fee = (id: string): FeeRule => (catalog.cities as Record<string, { fee: FeeRule }>)[id].fee;
const sold: Record<string, SoldMap> = Object.fromEntries(events.flatMap((e) => e.sessions.map((s) => [s.id, Object.fromEntries(s.tiers.map((t) => [t.id, t.seedSold]))])));
const NOW = "2026-10-20T12:00";
const req = (r: Partial<PlanRequest> = {}): PlanRequest => ({ cityId: "bengaluru-in", from: "2026-10-24", to: "2026-10-25", budget: { amount: null, mode: "per-person" }, party: 1, categories: [], keywords: [], dinner: false, ...r });
const run = (r: PlanRequest) => plan(r, events, sold, fee, restaurants.restaurants, NOW);

describe("planner", () => {
  it("never returns an option outside the dates", () => {
    const r = run(req());
    expect(r.options.length).toBeGreaterThan(0);
    expect(r.options.length).toBeLessThanOrEqual(3);
    for (const o of r.options) expect(o.start.slice(0, 10) >= "2026-10-24" && o.start.slice(0, 10) <= "2026-10-25").toBe(true);
  });

  it("distinguishes per-person and total budgets", () => {
    expect(budgetPerPerson(req({ budget: { amount: 2000, mode: "total" }, party: 2 }))).toBe(1000);
    expect(budgetPerPerson(req({ budget: { amount: 2000, mode: "per-person" }, party: 2 }))).toBe(2000);
    const r = run(req({ budget: { amount: 2000, mode: "total" }, party: 2 }));
    for (const o of r.options) expect(o.total).toBeLessThanOrEqual(2000);
  });

  it("counts dinner estimates against the budget when dinner is on", () => {
    const r = run(req({ dinner: true, budget: { amount: 2500, mode: "per-person" } }));
    for (const o of r.options) expect(o.bookingTotal + (o.dinner?.estimate ?? 0)).toBeLessThanOrEqual(2500);
  });

  it("explains blockers instead of relaxing constraints", () => {
    const r = run(req({ budget: { amount: 100, mode: "per-person" }, categories: ["Music"] }));
    expect(r.options).toHaveLength(0);
    const b = r.blockers.find((x) => x.constraint === "budget");
    expect(b?.suggestion).toMatch(/Raise the per-person budget to at least/);
  });

  it("only labels Cheapest when it is the unique minimum across all feasible options", () => {
    const r = run(req());
    const cheapest = r.options.filter((o) => o.labels.includes("Cheapest"));
    expect(cheapest.length).toBeLessThanOrEqual(1);
    if (cheapest[0]) for (const o of r.options) expect(o.perPerson).toBeGreaterThanOrEqual(cheapest[0].perPerson);
  });

  it("revisions keep other requirements: cheaper stays in range and is strictly cheaper", () => {
    const first = run(req({ categories: ["Music"] })).options[0];
    const r = run(req({ categories: ["Music"], maxPerPerson: first.perPerson - 0.01 }));
    for (const o of r.options) {
      expect(o.perPerson).toBeLessThan(first.perPerson);
      expect(o.event.category).toBe("Music");
    }
  });

  it("simulated sell-out removes that session and replans with real selection logic", () => {
    const first = run(req({ categories: ["Music"] })).options[0];
    const r = run(req({ categories: ["Music"], simulatedSoldOut: [first.sessionId] }));
    expect(r.options.some((o) => o.sessionId === first.sessionId)).toBe(false);
  });

  it("checks restaurant hours, including late-night closing", () => {
    expect(openForDinner({ opens: "12:00", closes: "23:00" }, "2026-10-24T21:00")).toBe(true);
    expect(openForDinner({ opens: "12:00", closes: "23:00" }, "2026-10-24T22:30")).toBe(false);
    expect(openForDinner({ opens: "12:00", closes: "02:00" }, "2026-10-24T23:30")).toBe(true);
  });
});
