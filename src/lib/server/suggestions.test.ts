import { describe, expect, it } from "vitest";
import { cityById } from "@/lib/locations";
import { oldestFetch, replaceRows, rowsFor } from "./db/suggestions";
import { loadStarters, tasteSuggestions } from "./suggestions";

const BLR = cityById("bengaluru-in")!;

describe("taste suggestions", () => {
  it("serves the curated starters (never items without a Qloo ID) and schedules a refresh when the city has no Qloo rows", async () => {
    const tasks: unknown[] = [];
    const r = await tasteSuggestions(BLR, (t) => tasks.push(t));
    expect(tasks).toHaveLength(1);
    expect(r.freshness).toBe("pending");
    expect(r.tabs.movie.popular).toHaveLength(0);
    expect(r.tabs.movie.starters.length).toBeGreaterThan(0);
    expect(r.tabs.movie.starters.every((s) => /^[0-9A-F-]{36}$/i.test(s.id))).toBe(true);
    expect(r.tabs["for-you"].trending).toEqual([]);
  });

  it("reads Qloo rows from the table and keeps them fresh for 24 h", async () => {
    await loadStarters();
    await replaceRows(BLR.id, "artist", "popular", Array.from({ length: 12 }, (_, i) => ({ id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`, name: `Artist ${i}`, type: "artist", image: null, indiaMatch: true })));
    await replaceRows(BLR.id, "place", "trending", [{ id: "11111111-0000-0000-0000-000000000000", name: "Cafe", type: "place", image: "https://x/y.jpg" }]);
    const tasks: unknown[] = [];
    const r = await tasteSuggestions(BLR, (t) => tasks.push(t));
    expect(tasks).toHaveLength(0);
    expect(r.freshness).toBe("fresh");
    expect(r.tabs.artist.popular).toHaveLength(12);
    expect(r.tabs.artist.starters).toHaveLength(0);
    expect(r.tabs.place.trending.map((x) => x.name)).toEqual(["Cafe"]);
    expect(r.tabs["for-you"].popular.slice(0, 2).map((x) => x.name)).toEqual(["Artist 0", "Artist 1"]);
    expect(await oldestFetch(BLR.id)).not.toBeNull();
  });

  it("replacing a list is atomic and idempotent", async () => {
    const items = [{ id: "22222222-0000-0000-0000-000000000000", name: "A", type: "book", image: null }];
    await replaceRows(BLR.id, "book", "popular", items);
    await replaceRows(BLR.id, "book", "popular", items);
    expect((await rowsFor(BLR.id)).filter((r) => r.tab === "book" && r.source === "popular")).toHaveLength(1);
  });
});
