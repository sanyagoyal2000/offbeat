/**
 * Reserved seating for cinemas and theatres (pure, shared by the catalog generator, server and UI).
 * A layout is rows of seats grouped into sections; each section maps to a ticket tier by name.
 * Seats sold before the demo ("seed") are chosen deterministically from the session id so they
 * never change between renders, servers or restarts.
 */

export type SeatRow = { row: string; section: string; seats: number; aisles?: number[]; gapBefore?: boolean };
export type Layout = { id: string; label: string; stageLabel: string; rows: SeatRow[] };

const rows = (letters: string, section: string, seats: number, aisles?: number[], gapBefore = false): SeatRow[] =>
  [...letters].map((row, i) => ({ row, section, seats, aisles, gapBefore: gapBefore && i === 0 }));

export const LAYOUTS: Record<string, Layout> = {
  "cinema-standard": {
    id: "cinema-standard",
    label: "Cinema screen",
    stageLabel: "Screen this way",
    rows: [...rows("ABC", "Classic", 16, [4, 12]), ...rows("DEFGH", "Prime", 18, [5, 13], true), ...rows("JK", "Recliner", 10, [5], true)],
  },
  "theatre-hall": {
    id: "theatre-hall",
    label: "Hall",
    stageLabel: "Stage",
    rows: [...rows("ABCDEFGH", "Stalls", 20, [6, 14]), ...rows("JKLM", "Balcony", 16, [8], true)],
  },
  "blackbox-small": {
    id: "blackbox-small",
    label: "Studio",
    stageLabel: "Stage",
    rows: [...rows("AB", "Front", 12, [6]), ...rows("CDEF", "Standard", 14, [7], true)],
  },
};

export const seatId = (row: string, n: number) => `${row}${n}`;

export function sectionSeats(layout: Layout, section: string): string[] {
  return layout.rows.filter((r) => r.section === section).flatMap((r) => Array.from({ length: r.seats }, (_, i) => seatId(r.row, i + 1)));
}

export const sectionCapacity = (layout: Layout, section: string) => sectionSeats(layout, section).length;
export const sections = (layout: Layout) => [...new Set(layout.rows.map((r) => r.section))];

function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/**
 * Deterministic seed-sold seats: `count` seats in the section, picked in small clusters (as real
 * bookings look) using a hash of the session id.
 */
export function seededTaken(sessionId: string, layout: Layout, section: string, count: number): Set<string> {
  const all = sectionSeats(layout, section);
  const taken = new Set<string>();
  let h = hash(`${sessionId}|${section}`);
  let guard = 0;
  while (taken.size < Math.min(count, all.length) && guard++ < 10000) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    const start = h % all.length;
    const cluster = 1 + (h % 4);
    for (let i = 0; i < cluster && taken.size < count; i++) taken.add(all[(start + i) % all.length]);
  }
  return taken;
}

export function sectionOf(layout: Layout, seat: string): string | null {
  const m = seat.match(/^([A-Z])(\d+)$/);
  if (!m) return null;
  const r = layout.rows.find((x) => x.row === m[1]);
  return r && Number(m[2]) >= 1 && Number(m[2]) <= r.seats ? r.section : null;
}

/** Validate a seat selection: all seats real, in one section (one ticket type), free, no duplicates. */
export function checkSeats(layout: Layout, seats: string[], taken: Set<string>): { ok: true; section: string } | { ok: false; error: string } {
  if (!seats.length) return { ok: false, error: "Choose at least one seat." };
  if (new Set(seats).size !== seats.length) return { ok: false, error: "A seat was selected twice." };
  const secs = new Set(seats.map((s) => sectionOf(layout, s)));
  if (secs.has(null)) return { ok: false, error: "One of those seats doesn't exist." };
  if (secs.size > 1) return { ok: false, error: "Choose seats from one section (ticket type) per booking." };
  const gone = seats.filter((s) => taken.has(s));
  if (gone.length) return { ok: false, error: `${gone.join(", ")} ${gone.length === 1 ? "was" : "were"} just taken. Pick other seats.` };
  return { ok: true, section: [...secs][0]! };
}
