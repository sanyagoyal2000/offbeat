import { describe, expect, it } from "vitest";
import catalog from "../../data/catalog.json";
import { EventSchema } from "./events";
import { INR_RANGES } from "./pricing";
import { formatClock, formatMoney, localToInstant, nowIn, todayIn } from "./tz";

describe("time zones and currency", () => {
  it("reads 'today' in the destination's zone", () => {
    const at = new Date("2026-10-20T20:30:00Z"); // 02:00 next day in Bengaluru, 16:30 in New York
    expect(todayIn("Asia/Kolkata", at)).toBe("2026-10-21");
    expect(todayIn("America/New_York", at)).toBe("2026-10-20");
    expect(nowIn("Europe/London", at)).toBe("2026-10-20T21:30");
  });

  it("converts venue-local times across DST changes", () => {
    expect(localToInstant("2026-10-24T19:00", "Europe/London").toISOString()).toBe("2026-10-24T18:00:00.000Z"); // BST
    expect(localToInstant("2026-10-31T19:00", "Europe/London").toISOString()).toBe("2026-10-31T19:00:00.000Z"); // GMT
    expect(localToInstant("2026-11-07T20:00", "America/New_York").toISOString()).toBe("2026-11-08T01:00:00.000Z"); // EST
  });

  it("formats venue-local times and booking currencies", () => {
    expect(formatClock("2026-10-24T19:30")).toBe("7:30 pm");
    expect(formatClock("2026-10-24T12:30")).toBe("12:30 pm");
    expect(formatClock("2026-10-24T00:15")).toBe("12:15 am");
    expect(formatMoney(1199, "INR")).toBe("₹1,199");
    expect(formatMoney(18, "GBP")).toBe("£18");
    expect(formatMoney(22.5, "USD")).toBe("$22.50");
    expect(formatMoney(0, "USD")).toBe("Free");
  });
});

describe("sample catalog", () => {
  const events = catalog.events.map((e) => EventSchema.parse(e));
  it("covers three cities with explicit zone and currency", () => {
    expect(new Set(events.map((e) => e.cityId))).toEqual(new Set(["bengaluru-in", "london-gb", "new-york-us"]));
    for (const e of events) expect(e.timezone).toBe((catalog.cities as Record<string, { timezone: string; currency: string }>)[e.cityId].timezone);
  });
  it("has unique, stable session ids and INR prices in range", () => {
    const ids = events.flatMap((e) => e.sessions.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of events.filter((x) => x.currency === "INR"))
      for (const t of e.sessions[0].tiers) {
        expect(t.price).toBeGreaterThanOrEqual(INR_RANGES[e.category].min);
        expect(t.price).toBeLessThanOrEqual(INR_RANGES[e.category].max);
      }
  });
});
