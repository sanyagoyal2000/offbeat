import { describe, expect, it } from "vitest";
import { ENTITY_TABS, GRID, allocateSlots, composeForYou, composeTab, isIndiaMatch, trendingDiffers, type EntityTab, type Suggestion } from "./suggestions";

const s = (id: string, indiaMatch = false, type = "artist"): Suggestion => ({ id, name: id, type, image: null, indiaMatch });
const many = (n: number, india: number, prefix = "q") => Array.from({ length: n }, (_, i) => s(`${prefix}${i}`, i < india));
const starters = many(10, 0, "st");

describe("isIndiaMatch (from Qloo metadata only)", () => {
  it("uses release country, Indian music tags and descriptions", () => {
    expect(isIndiaMatch({ properties: { release_country: ["India", "United States"] } })).toBe(true);
    expect(isIndiaMatch({ tags: [{ name: "Tamil Film Music" }, { name: "Kollywood" }] })).toBe(true);
    expect(isIndiaMatch({ properties: { description: "A podcast recorded in Mumbai" } })).toBe(true);
    expect(isIndiaMatch({ properties: { release_country: ["United States"] }, tags: [{ name: "Tech News" }] })).toBe(false);
    expect(isIndiaMatch({})).toBe(false);
  });
});

describe("composeTab", () => {
  it("shows Qloo's list as-is when it's full and mostly Indian", () => {
    const r = composeTab(many(12, 9), starters, { cityInIndia: true });
    expect(r.popular).toHaveLength(12);
    expect(r.starters).toHaveLength(0);
  });

  it("mixes in starter picks for an Indian city when Qloo's list is mostly non-Indian", () => {
    const r = composeTab(many(12, 2), starters, { cityInIndia: true });
    expect(r.popular.length + r.starters.length).toBe(GRID);
    expect(r.popular.slice(0, 2).every((x) => x.indiaMatch)).toBe(true); // India-tied Qloo items first
    expect(r.starters.length).toBeGreaterThan(0);
  });

  it("mixes in starter picks when Qloo returns too few", () => {
    const r = composeTab(many(3, 3), starters, { cityInIndia: true });
    expect(r.popular).toHaveLength(3);
    expect(r.starters).toHaveLength(9);
  });

  it("never mixes starters outside India and never duplicates", () => {
    expect(composeTab(many(4, 0), starters, { cityInIndia: false }).starters).toHaveLength(0);
    const dupe = composeTab([s("x", true)], [s("x"), s("y")], { cityInIndia: true });
    expect(dupe.starters.map((x) => x.id)).toEqual(["y"]);
  });
});

describe("composeForYou", () => {
  it("takes two per type, Qloo first, starters only to fill", () => {
    const byTab = Object.fromEntries(ENTITY_TABS.map((t) => [t, { popular: t === "podcast" ? [] : [s(`${t}1`, true, t), s(`${t}2`, true, t), s(`${t}3`, true, t)], starters: [s(`${t}-st`, false, t)] }])) as Record<EntityTab, { popular: Suggestion[]; starters: Suggestion[] }>;
    const r = composeForYou(byTab);
    expect(r.popular).toHaveLength(10); // 5 types × 2
    expect(r.starters.map((x) => x.id)).toEqual(["podcast-st"]);
  });
});

describe("trendingDiffers", () => {
  it("treats an unchanged list as not trending", () => {
    expect(trendingDiffers(["a", "b", "c", "d"], ["a", "b", "c", "d"])).toBe(false);
    expect(trendingDiffers(["a", "b", "c", "d"], ["a", "x", "y", "z"])).toBe(true);
    expect(trendingDiffers(["a"], [])).toBe(false);
  });
});

describe("allocateSlots", () => {
  it("splits 4 slots across picked types by count", () => {
    expect(allocateSlots(["artist"])).toEqual({ artist: 4 });
    expect(allocateSlots(["artist", "artist", "movie"])).toEqual({ artist: 3, movie: 1 });
    const mixed = allocateSlots(["artist", "movie", "book", "tv_show", "podcast"]);
    expect(Object.values(mixed).reduce((a, b) => a + b, 0)).toBe(4);
  });
});
