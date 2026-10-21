import { describe, expect, it } from "vitest";
import { getEvent } from "./catalog";
import { mappingsFor, rankByTaste, vibeTags } from "./taste";

const interest = { id: "CFB97CDA-1B2D-4F1A-B707-415E76AFC016", name: "Norah Jones", type: "artist" };

describe("Qloo fallback", () => {
  it("records direct vs approximate mappings", async () => {
    const film = mappingsFor((await getEvent("kumbalangi-nights--talkies"))!);
    expect(film.find((m) => m.qlooType === "urn:entity:movie")?.match).toBe("direct");
    const gig = mappingsFor((await getEvent("acoustic-sundowner"))!);
    expect(gig.find((m) => m.qlooType === "urn:entity:artist")?.match).toBe("approximate");
  });

  it("returns no-interests without calling Qloo", async () => {
    const r = await rankByTaste([], [(await getEvent("acoustic-sundowner"))!]);
    expect(r.status).toBe("no-interests");
    expect(r.rank.size).toBe(0);
  });

  it("degrades to 'unavailable' (events stay, no ranking) when Qloo can't be reached", async () => {
    const events = [(await getEvent("acoustic-sundowner"))!, (await getEvent("kumbalangi-nights--talkies"))!];
    const r = await rankByTaste([interest], events);
    expect(r.status).toBe("unavailable");
    expect(r.rank.size).toBe(0);
    expect(r.message).toMatch(/shown by date/);
    expect((await vibeTags([interest])).status).toBe("unavailable");
  });

  it("reports no coverage for events without mappings", async () => {
    const e = (await getEvent("acoustic-sundowner"))!;
    const r = await rankByTaste([interest], [{ ...e, id: "unmapped", qlooMappings: [] }]);
    expect(r.status).toBe("no-coverage");
  });
});
