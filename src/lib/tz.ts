/**
 * Time-zone and currency helpers. Event times are stored as venue-local wall-clock strings
 * ("2026-10-24T19:00") plus an IANA zone, so they never shift when rendered elsewhere.
 */

export type LocalDateTime = string; // "YYYY-MM-DDTHH:mm" in the venue's zone

/** Current wall-clock time in a zone, as "YYYY-MM-DDTHH:mm". */
export function nowIn(timezone: string, now = new Date()): LocalDateTime {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export const todayIn = (timezone: string, now = new Date()) => nowIn(timezone, now).slice(0, 10);

/** Offset (minutes) of a zone at a given instant. */
function offsetMinutes(timezone: string, at: Date): number {
  const local = nowIn(timezone, at);
  const asUtc = Date.UTC(+local.slice(0, 4), +local.slice(5, 7) - 1, +local.slice(8, 10), +local.slice(11, 13), +local.slice(14, 16));
  return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

/** Convert venue-local wall-clock time to a real instant (handles DST by re-checking the offset). */
export function localToInstant(local: LocalDateTime, timezone: string): Date {
  const guess = Date.UTC(+local.slice(0, 4), +local.slice(5, 7) - 1, +local.slice(8, 10), +local.slice(11, 13), +local.slice(14, 16));
  let instant = new Date(guess - offsetMinutes(timezone, new Date(guess)) * 60000);
  instant = new Date(guess - offsetMinutes(timezone, instant) * 60000);
  return instant;
}

const asDate = (local: LocalDateTime) => new Date(`${local.slice(0, 16)}:00Z`);

/** Format a venue-local time without converting zones: "Sat 24 Oct", "7:00 pm". */
export function formatLocal(local: LocalDateTime, opts: Intl.DateTimeFormatOptions, locale = "en-GB") {
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" }).format(asDate(local));
}
export const formatDay = (local: LocalDateTime) => formatLocal(local, { weekday: "short", day: "numeric", month: "short" });
export const formatLongDay = (local: LocalDateTime) => formatLocal(local, { weekday: "long", day: "numeric", month: "long" });
// en-US for the clock: en-GB renders 12:30 pm as "0:30 pm" in 12-hour mode.
export const formatClock = (local: LocalDateTime) =>
  formatLocal(local, { hour: "numeric", minute: "2-digit", hour12: true }, "en-US").replace(/\s?(AM|PM)$/i, (m) => ` ${m.trim().toLowerCase()}`);
export const formatDayTime = (local: LocalDateTime) => `${formatDay(local)} · ${formatClock(local)}`;

/** Short zone label for the venue, e.g. "IST", "GMT+1", "EDT". */
export function zoneLabel(timezone: string, local: LocalDateTime) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "short" }).formatToParts(localToInstant(local, timezone));
  return parts.find((p) => p.type === "timeZoneName")?.value ?? timezone;
}

export const minutesBetween = (a: LocalDateTime, b: LocalDateTime) => (asDate(b).getTime() - asDate(a).getTime()) / 60000;
export const addMinutesLocal = (local: LocalDateTime, minutes: number): LocalDateTime =>
  new Date(asDate(local).getTime() + minutes * 60000).toISOString().slice(0, 16);

/** Money in the event's booking currency. */
export function formatMoney(amount: number, currency: string) {
  if (amount === 0) return "Free";
  const locale = currency === "INR" ? "en-IN" : currency === "USD" ? "en-US" : "en-GB";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

export const currencySymbol = (currency: string) =>
  new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;
