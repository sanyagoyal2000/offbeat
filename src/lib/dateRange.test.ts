import { describe, expect, it } from "vitest";
import {
  EMPTY_SELECTION,
  clearSelection,
  countOutside,
  filterFeed,
  formatRange,
  monthGrid,
  parseRangeParams,
  pillRange,
  presetRange,
  selectDay,
  selectionToRange,
  timeOfDayOf,
  type FeedItem,
} from "./dateRange";

describe("range selection", () => {
  it("selects a single day when the same date is tapped twice", () => {
    const s = selectDay(selectDay(EMPTY_SELECTION, "2026-10-24"), "2026-10-24");
    expect(s).toEqual({ start: "2026-10-24", end: "2026-10-24" });
    expect(selectionToRange(s)).toEqual({ from: "2026-10-24", to: "2026-10-24" });
  });

  it("orders a reversed start and end", () => {
    const s = selectDay(selectDay(EMPTY_SELECTION, "2026-10-30"), "2026-10-24");
    expect(s).toEqual({ start: "2026-10-24", end: "2026-10-30" });
  });

  it("selects across a month boundary", () => {
    const s = selectDay(selectDay(EMPTY_SELECTION, "2026-10-24"), "2026-11-02");
    expect(selectionToRange(s)).toEqual({ from: "2026-10-24", to: "2026-11-02" });
    expect(formatRange(selectionToRange(s)!)).toBe("24 Oct – 2 Nov");
  });

  it("starts over on a third tap", () => {
    const done = { start: "2026-10-24", end: "2026-10-30" };
    expect(selectDay(done, "2026-11-05")).toEqual({ start: "2026-11-05", end: null });
  });

  it("treats a start-only selection as one day", () => {
    expect(selectionToRange({ start: "2026-10-25", end: null })).toEqual({ from: "2026-10-25", to: "2026-10-25" });
  });

  it("clears", () => {
    expect(clearSelection()).toEqual(EMPTY_SELECTION);
    expect(selectionToRange(clearSelection())).toBeNull();
  });
});

describe("presets and pills (today = Sat 17 Oct 2026)", () => {
  const today = "2026-10-17";
  it("resolves the date pills", () => {
    expect(pillRange("today", today)).toEqual({ from: today, to: today });
    expect(pillRange("tomorrow", today)).toEqual({ from: "2026-10-18", to: "2026-10-18" });
    expect(pillRange("weekend", today)).toEqual({ from: "2026-10-17", to: "2026-10-18" });
    expect(pillRange("nextWeekend", today)).toEqual({ from: "2026-10-24", to: "2026-10-25" });
  });
  it("on a Sunday, this weekend is just today", () => {
    expect(pillRange("weekend", "2026-10-18")).toEqual({ from: "2026-10-18", to: "2026-10-18" });
  });
  it("on a weekday, this weekend is the coming Sat–Sun", () => {
    expect(pillRange("weekend", "2026-10-21")).toEqual({ from: "2026-10-24", to: "2026-10-25" });
  });
  it("resolves the sheet presets", () => {
    expect(presetRange("thisWeek", today)).toEqual({ from: today, to: "2026-10-18" });
    expect(presetRange("next7", today)).toEqual({ from: today, to: "2026-10-23" });
    expect(presetRange("thisMonth", today)).toEqual({ from: today, to: "2026-10-31" });
    expect(presetRange("nextMonth", today)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
  });
});

describe("feed filtering", () => {
  const today = "2026-10-17";
  const feed: (FeedItem & { id: string })[] = [
    { id: "ranked-1", date: "2026-10-24", start: "19:00", from: 1199 },
    { id: "ranked-2", date: "2026-10-18", start: "11:00", from: 799 },
    { id: "ranked-3", date: "2026-11-01", start: "21:30", from: 0 },
    { id: "ranked-4", date: "2026-10-16", start: "19:00", from: 500 }, // yesterday
    { id: "ranked-5", date: "2026-10-25", start: "17:30", from: null }, // sold out
  ];
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

  it("drops past days and keeps the ranking order", () => {
    expect(ids(filterFeed(feed, { today }))).toEqual(["ranked-1", "ranked-2", "ranked-3", "ranked-5"]);
  });

  it("filters by an inclusive range", () => {
    expect(ids(filterFeed(feed, { today, range: { from: "2026-10-24", to: "2026-11-01" } }))).toEqual(["ranked-1", "ranked-3", "ranked-5"]);
  });

  it("combines range, time of day and price", () => {
    const r = { from: "2026-10-17", to: "2026-11-30" };
    expect(ids(filterFeed(feed, { today, range: r, timeOfDay: "evening" }))).toEqual(["ranked-1", "ranked-5"]);
    expect(ids(filterFeed(feed, { today, range: r, underPrice: 1000 }))).toEqual(["ranked-2", "ranked-3"]);
  });

  it("counts what a range leaves out", () => {
    expect(countOutside(feed, { from: "2026-10-24", to: "2026-10-25" })).toBe(3);
  });

  it("buckets start times", () => {
    expect(["07:00", "15:00", "19:30", "21:30", "01:00"].map(timeOfDayOf)).toEqual(["morning", "afternoon", "evening", "late", "late"]);
  });
});

describe("url and grid", () => {
  it("parses, orders and rejects bad params", () => {
    expect(parseRangeParams("2026-11-02", "2026-10-24")).toEqual({ from: "2026-10-24", to: "2026-11-02" });
    expect(parseRangeParams("2026-10-24", null)).toEqual({ from: "2026-10-24", to: "2026-10-24" });
    expect(parseRangeParams("nope", "")).toBeNull();
  });

  it("builds Monday-first month grids", () => {
    const oct = monthGrid("2026-10-01");
    expect(oct[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]); // 1 Oct 2026 is a Thursday
    expect(oct.flat().filter(Boolean)).toHaveLength(31);
  });
});
