import { describe, expect, it } from "vitest";
import { clusterWishes, compatible, eventFitsWish, type Wish } from "./wishes";

const w = (over: Partial<Wish> & { id: string }): Wish => ({
  uid: "u",
  source: "real",
  status: "open",
  createdAt: "2026-10-18T10:00:00Z",
  updatedAt: "2026-10-18T10:00:00Z",
  proposals: [],
  text: "",
  category: "Music",
  keywords: ["acoustic"],
  from: "2026-10-24",
  to: "2026-11-30",
  budgetMax: 1500,
  currency: "INR",
  location: { cityId: "bengaluru-in", cityName: "Bengaluru", area: "Indiranagar", lat: 12.9719, lng: 77.6412, radiusKm: 5 },
  tasteRefs: [],
  notify: true,
  ...over,
});

describe("wish grouping", () => {
  it("groups only when every stated constraint overlaps", () => {
    expect(compatible(w({ id: "a" }), w({ id: "b", budgetMax: 800 }))).toBe(true);
    expect(compatible(w({ id: "a" }), w({ id: "b", from: "2026-12-05", to: "2026-12-20" }))).toBe(false);
    expect(compatible(w({ id: "a" }), w({ id: "b", category: "Comedy" }))).toBe(false);
    expect(compatible(w({ id: "a" }), w({ id: "b", location: { ...w({ id: "x" }).location, lat: 13.2, lng: 77.9 } }))).toBe(false);
  });

  it("counts real and seeded wishes separately and excludes private or withdrawn ones", () => {
    const clusters = clusterWishes(
      [w({ id: "r1" }), w({ id: "r2", budgetMax: 900 }), w({ id: "s1", source: "seed" }), w({ id: "p", notify: false }), w({ id: "x", status: "withdrawn" })],
      { today: "2026-10-20" },
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].realCount).toBe(2);
    expect(clusters[0].seedCount).toBe(1);
    expect(clusters[0].budgetCeiling).toBe(900);
    expect(clusters[0].explanation).toMatch(/within 5 km/);
  });

  it("matches a proposed event only if it satisfies the wish", () => {
    const e = { cityId: "bengaluru-in", category: "Music" as const, tags: ["acoustic"], title: "Rooftop Acoustic", summary: "", venue: { lat: 12.975, lng: 77.64 }, sessions: [{ start: "2026-11-07T19:00" }] };
    expect(eventFitsWish(w({ id: "a" }), e, 999)).toBe(true);
    expect(eventFitsWish(w({ id: "a" }), e, 2000)).toBe(false);
    expect(eventFitsWish(w({ id: "a" }), { ...e, sessions: [{ start: "2026-12-12T19:00" }] }, 999)).toBe(false);
  });
});
