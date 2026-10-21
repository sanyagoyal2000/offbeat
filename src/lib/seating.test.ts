import { describe, expect, it } from "vitest";
import { bestAvailable } from "@/components/SeatMap";
import { LAYOUTS, checkSeats, sectionCapacity, seededTaken, sectionOf } from "./seating";

const cinema = LAYOUTS["cinema-standard"];

describe("seat maps", () => {
  it("derives capacities and sections from the layout", () => {
    expect(sectionCapacity(cinema, "Classic")).toBe(48);
    expect(sectionCapacity(cinema, "Prime")).toBe(90);
    expect(sectionCapacity(cinema, "Recliner")).toBe(20);
    expect(sectionOf(cinema, "E7")).toBe("Prime");
    expect(sectionOf(cinema, "E19")).toBeNull();
  });

  it("seeds the same taken seats for a session every time", () => {
    const a = seededTaken("film--cinema--20261024-1900", cinema, "Prime", 30);
    const b = seededTaken("film--cinema--20261024-1900", cinema, "Prime", 30);
    expect(a.size).toBe(30);
    expect([...a]).toEqual([...b]);
    expect([...a].every((s) => sectionOf(cinema, s) === "Prime")).toBe(true);
  });

  it("validates selections: one section, free, real, no duplicates", () => {
    const taken = new Set(["E7"]);
    expect(checkSeats(cinema, ["E8", "E9"], taken)).toEqual({ ok: true, section: "Prime" });
    expect(checkSeats(cinema, ["E7"], taken)).toMatchObject({ ok: false });
    expect(checkSeats(cinema, ["A1", "E8"], taken)).toMatchObject({ ok: false, error: expect.stringMatching(/one section/) });
    expect(checkSeats(cinema, ["E8", "E8"], taken)).toMatchObject({ ok: false });
    expect(checkSeats(cinema, ["Z1"], taken)).toMatchObject({ ok: false });
  });

  it("best available finds adjacent seats within one block", () => {
    const seats = bestAvailable(cinema, "Recliner", 3, new Set())!;
    expect(seats).toHaveLength(3);
    const nums = seats.map((s) => Number(s.slice(1)));
    expect(nums[2] - nums[0]).toBe(2);
    expect(new Set(seats.map((s) => s[0])).size).toBe(1);
    // Recliner blocks are 5 wide (aisle after 5), so 6 together is impossible.
    expect(bestAvailable(cinema, "Recliner", 6, new Set())).toBeNull();
  });
});
