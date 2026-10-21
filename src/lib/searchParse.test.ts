import { describe, expect, it } from "vitest";
import { parseSearch } from "./searchParse";

const TODAY = "2026-10-20"; // Tuesday

describe("search parsing", () => {
  it("parses activity, day and budget together", () => {
    const p = parseSearch("pottery this Sunday under ₹1,500", TODAY);
    expect(p.category).toBe("Workshops & classes");
    expect(p.keywords).toContain("pottery");
    expect(p.range).toEqual({ from: "2026-10-25", to: "2026-10-25" });
    expect(p.maxPrice).toBe(1500);
  });

  it("handles tonight, party size and comedy", () => {
    const p = parseSearch("stand-up comedy tonight for two", TODAY);
    expect(p.category).toBe("Comedy");
    expect(p.dateLabel).toBe("Tonight");
    expect(p.range).toEqual({ from: TODAY, to: TODAY });
    expect(p.partySize).toBe(2);
  });

  it("understands other currencies, 'next weekend' and free", () => {
    expect(parseSearch("jazz next weekend below $40", TODAY)).toMatchObject({ category: "Music", maxPrice: 40, range: { from: "2026-10-31", to: "2026-11-01" } });
    expect(parseSearch("free meetups", TODAY).maxPrice).toBe(0);
    expect(parseSearch("hikes under 2k", TODAY).maxPrice).toBe(2000);
  });

  it("parses explicit dates and areas", () => {
    expect(parseSearch("film on 24 oct near indiranagar", TODAY)).toMatchObject({ category: "Movies", range: { from: "2026-10-24", to: "2026-10-24" }, near: "Indiranagar" });
    expect(parseSearch("trek 3 jan", TODAY).range).toEqual({ from: "2027-01-03", to: "2027-01-03" });
  });

  it("never drops unrecognised words: they stay as keywords", () => {
    const p = parseSearch("ukulele circle saturday", TODAY);
    expect(p.keywords).toEqual(expect.arrayContaining(["ukulele", "circle"]));
    expect(p.range).toEqual({ from: "2026-10-24", to: "2026-10-24" });
  });
});
