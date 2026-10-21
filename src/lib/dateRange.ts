/**
 * Date-range logic for the Home feed and the calendar sheet. Pure functions on ISO day strings
 * ("2026-10-24"), so they are easy to test and safe to put in the URL.
 */
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isSameYear,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export type IsoDay = string;
export type DateRange = { from: IsoDay; to: IsoDay };

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
export const toIso = (d: Date): IsoDay => format(d, "yyyy-MM-dd");
const day = (iso: IsoDay) => parseISO(iso);
const shift = (iso: IsoDay, n: number) => toIso(addDays(day(iso), n));

/* ── Two-step selection ─────────────────────────────────────────────── */

export type Selection = { start: IsoDay | null; end: IsoDay | null };
export const EMPTY_SELECTION: Selection = { start: null, end: null };

/**
 * First tap sets the start, second tap sets the end. Tapping the start again selects that single day;
 * tapping an earlier day swaps them so the range is always ordered; a third tap starts over.
 */
export function selectDay(sel: Selection, iso: IsoDay): Selection {
  if (!sel.start || sel.end) return { start: iso, end: null };
  if (iso === sel.start) return { start: iso, end: iso };
  return iso < sel.start ? { start: iso, end: sel.start } : { start: sel.start, end: iso };
}

export const clearSelection = (): Selection => EMPTY_SELECTION;

/** A half-finished selection (start only) counts as that single day. */
export function selectionToRange(sel: Selection): DateRange | null {
  if (!sel.start) return null;
  return { from: sel.start, to: sel.end ?? sel.start };
}

export const rangeToSelection = (r: DateRange | null): Selection => (r ? { start: r.from, end: r.to } : EMPTY_SELECTION);

export const inRange = (iso: IsoDay, r: DateRange) => iso >= r.from && iso <= r.to;

/* ── Presets ────────────────────────────────────────────────────────── */

export type DatePill = "today" | "tomorrow" | "weekend" | "nextWeekend";
export type Preset = "thisWeek" | "next7" | "thisMonth" | "nextMonth";

const WEEK = { weekStartsOn: 1 as const };

/** Saturday–Sunday of the current weekend (on Sunday, just today), or of the one after. */
function weekendOf(today: IsoDay, offsetWeeks: number): DateRange {
  const sunday = endOfWeek(day(today), WEEK);
  const saturday = addDays(sunday, -1);
  const from = toIso(addDays(saturday, offsetWeeks * 7));
  const to = toIso(addDays(sunday, offsetWeeks * 7));
  return { from: from < today ? today : from, to };
}

export function pillRange(pill: DatePill, today: IsoDay): DateRange {
  switch (pill) {
    case "today":
      return { from: today, to: today };
    case "tomorrow":
      return { from: shift(today, 1), to: shift(today, 1) };
    case "weekend":
      return weekendOf(today, 0);
    case "nextWeekend":
      return weekendOf(today, 1);
  }
}

export function presetRange(preset: Preset, today: IsoDay): DateRange {
  const t = day(today);
  switch (preset) {
    case "thisWeek":
      return { from: today, to: toIso(endOfWeek(t, WEEK)) };
    case "next7":
      return { from: today, to: shift(today, 6) };
    case "thisMonth":
      return { from: today, to: toIso(endOfMonth(t)) };
    case "nextMonth": {
      const next = addMonths(t, 1);
      return { from: toIso(startOfMonth(next)), to: toIso(endOfMonth(next)) };
    }
  }
}

/* ── Time of day ────────────────────────────────────────────────────── */

export const TIMES_OF_DAY = ["any", "morning", "afternoon", "evening", "late"] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];
export const TIME_OF_DAY_LABEL: Record<TimeOfDay, string> = {
  any: "Any time",
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  late: "Late night",
};

/** Bucket by start time: morning 5–12, afternoon 12–17, evening 17–21, late night 21–5. */
export function timeOfDayOf(startHHMM: string): Exclude<TimeOfDay, "any"> {
  const h = Number(startHHMM.slice(0, 2));
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "late";
}

/* ── Feed filtering ─────────────────────────────────────────────────── */

export type FeedItem = { date: IsoDay; start: string; from: number | null };

export type FeedFilter = {
  today: IsoDay;
  range?: DateRange | null;
  timeOfDay?: TimeOfDay;
  underPrice?: number | null;
};

/** Keeps the input order (the taste ranking) and only removes items. Past days are always dropped. */
export function filterFeed<T extends FeedItem>(items: T[], f: FeedFilter): T[] {
  return items.filter(
    (e) =>
      e.date >= f.today &&
      (!f.range || inRange(e.date, f.range)) &&
      (!f.timeOfDay || f.timeOfDay === "any" || timeOfDayOf(e.start) === f.timeOfDay) &&
      (f.underPrice == null || (e.from !== null && e.from < f.underPrice)),
  );
}

/** How many items a range would drop: used for the agent trace ("Dropped 7 outside your dates"). */
export const countOutside = (items: FeedItem[], r: DateRange) => items.filter((e) => !inRange(e.date, r)).length;

/* ── Formatting and URL ─────────────────────────────────────────────── */

/** "24 Oct", "24 Oct – 2 Nov", "28 Dec 2026 – 3 Jan 2027". */
export function formatRange(r: DateRange): string {
  const a = day(r.from);
  const b = day(r.to);
  if (r.from === r.to) return format(a, "d MMM");
  if (!isSameYear(a, b)) return `${format(a, "d MMM yyyy")} – ${format(b, "d MMM yyyy")}`;
  if (isSameMonth(a, b)) return `${format(a, "d")} – ${format(b, "d MMM")}`;
  return `${format(a, "d MMM")} – ${format(b, "d MMM")}`;
}

/** Reads ?from=&to= (either may be missing); ignores malformed values and orders the pair. */
export function parseRangeParams(from?: string | null, to?: string | null): DateRange | null {
  const f = from && ISO_RE.test(from) ? from : null;
  const t = to && ISO_RE.test(to) ? to : null;
  if (!f && !t) return null;
  const a = f ?? t!;
  const b = t ?? f!;
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

export const rangeQuery = (r: DateRange | null) => (r ? `from=${r.from}&to=${r.to}` : "");

/* ── Month grid ─────────────────────────────────────────────────────── */

/** Weeks (Monday first) covering the month; days outside the month are null. */
export function monthGrid(monthIso: IsoDay): (IsoDay | null)[][] {
  const m = day(monthIso);
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(m), WEEK), end: endOfWeek(endOfMonth(m), WEEK) });
  const weeks: (IsoDay | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7).map((d) => (isSameMonth(d, m) ? toIso(d) : null)));
  }
  return weeks;
}

export const monthStart = (iso: IsoDay) => toIso(startOfMonth(day(iso)));
export const addMonthsIso = (iso: IsoDay, n: number) => toIso(startOfMonth(addMonths(day(iso), n)));
export const addDaysIso = shift;
export const monthTitle = (iso: IsoDay) => format(day(iso), "MMMM yyyy");
/** "Saturday 24 October" */
export const longDay = (iso: IsoDay) => format(day(iso), "EEEE d MMMM");
