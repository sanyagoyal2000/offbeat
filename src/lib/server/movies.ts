/** Group cinema events by film for the movie pages. */
import "server-only";
import { cache } from "react";
import type { OfferEvent, SoldMap } from "@/lib/events";
import { remaining } from "@/lib/events";
import { nowIn } from "@/lib/tz";
import { bookingFee } from "@/lib/pricing";
import { feeRuleFor, publishedEvents, soldMaps } from "./catalog";
import { listFilms, type FilmInfo } from "./db/catalog";

export type { FilmInfo };
/** Film facts (from Qloo, stored in the films table), by film id. */
export const films = cache(() => listFilms());

export type Showtime = { eventId: string; sessionId: string; start: string; left: number; capacity: number; fromPrice: number; fee: number; total: number };
export type FilmListing = { film: FilmInfo; currency: string; cinemas: { event: OfferEvent; showtimes: Showtime[] }[]; nextStart: string | null; showCount: number };

export async function filmsInCity(cityId: string): Promise<FilmListing[]> {
  const events = (await publishedEvents(cityId)).filter((e) => e.category === "Movies" && e.film);
  const sold = await soldMaps(events);
  const FILMS = await films();
  const byFilm = new Map<string, FilmListing>();
  for (const e of events) {
    const film = FILMS[e.film!.id];
    if (!film) continue;
    const now = nowIn(e.timezone);
    const showtimes = e.sessions
      .filter((s) => !s.cancelled && s.start > now)
      .map((s) => toShowtime(e, s.id, sold[s.id] ?? {}))
      .filter((s): s is Showtime => !!s);
    const entry = byFilm.get(film.id) ?? { film, currency: e.currency, cinemas: [], nextStart: null, showCount: 0 };
    if (showtimes.length) {
      entry.cinemas.push({ event: e, showtimes });
      entry.showCount += showtimes.length;
      const first = showtimes[0].start;
      if (!entry.nextStart || first < entry.nextStart) entry.nextStart = first;
    }
    byFilm.set(film.id, entry);
  }
  return [...byFilm.values()].filter((f) => f.showCount > 0).sort((a, b) => (a.nextStart ?? "").localeCompare(b.nextStart ?? ""));
}

function toShowtime(e: OfferEvent, sessionId: string, sold: SoldMap): Showtime | null {
  const s = e.sessions.find((x) => x.id === sessionId);
  if (!s) return null;
  const tiers = s.tiers.filter((t) => remaining(t, sold) > 0);
  const fromPrice = Math.min(...(tiers.length ? tiers : s.tiers).map((t) => t.price));
  const fee = bookingFee(fromPrice, feeRuleFor(e.cityId), e.currency);
  return {
    eventId: e.id,
    sessionId,
    start: s.start,
    left: s.tiers.reduce((n, t) => n + remaining(t, sold), 0),
    capacity: s.tiers.reduce((n, t) => n + t.capacity, 0),
    fromPrice,
    fee,
    total: Math.round((fromPrice + fee) * 100) / 100,
  };
}
