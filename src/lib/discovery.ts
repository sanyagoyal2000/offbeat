/**
 * Discovery: hard constraints first, then ordering. Taste (Qloo) can only reorder events that
 * already satisfy date, location, price-with-fees, availability, category and party size.
 */
import type { Category } from "./categories";
import { inRange, timeOfDayOf, type DateRange, type TimeOfDay } from "./dateRange";
import { cheapestTier, remaining, sessionAvailability, type Availability, type FeeRule, type OfferEvent, type Session, type SoldMap, type Tier } from "./events";
import { straightLineMeters, type LatLng } from "./geo";
import { bookingFee } from "./pricing";

export type DiscoveryFilter = {
  cityId: string;
  nowLocal: string; // "YYYY-MM-DDTHH:mm" in the destination zone
  range?: DateRange | null;
  timeOfDay?: TimeOfDay;
  /** Earliest start time of day, "HH:mm" (e.g. "17:00" for Tonight). */
  minStartTime?: string;
  /** Per-person maximum including the booking fee, in the city's currency. */
  maxPrice?: number | null;
  category?: Category | null;
  keywords?: string[];
  near?: string | null;
  partySize?: number;
  includeSoldOut?: boolean;
  /** Optional radius around a point. */
  within?: { point: LatLng; km: number } | null;
};

export type Offer = {
  event: OfferEvent;
  session: Session; // first session that satisfies the filters
  sessionCount: number; // how many matching sessions
  tier: Tier | null; // cheapest tier with enough seats
  fromPrice: number | null; // ticket price (before fee) of that tier
  fee: number | null;
  availability: Availability;
  left: number;
};

export type DropReason = "date" | "time" | "price" | "sold-out" | "category" | "keyword" | "area" | "distance" | "party";

const haystack = (e: OfferEvent) =>
  [e.title, e.summary, e.category, e.venue.name, e.venue.area, ...e.tags, ...(e.show?.performers ?? []), e.movie?.language ?? ""].join(" ").toLowerCase();

export function matchesKeywords(e: OfferEvent, keywords: string[] = []) {
  if (!keywords.length) return true;
  const h = haystack(e);
  return keywords.every((k) => h.includes(k.toLowerCase().replace(/s$/, "")));
}

/**
 * Evaluate one event against the filters. Returns the offer, or the first reason it was dropped
 * (used for honest "why nothing fits" explanations).
 */
export function evaluate(
  e: OfferEvent,
  sold: Record<string, SoldMap>,
  f: DiscoveryFilter,
  feeRule: FeeRule,
): { offer: Offer } | { dropped: DropReason } {
  if (e.cityId !== f.cityId || e.status !== "published") return { dropped: "area" };
  if (f.category && e.category !== f.category) return { dropped: "category" };
  if (!matchesKeywords(e, f.keywords)) return { dropped: "keyword" };
  if (f.near && !e.venue.area.toLowerCase().includes(f.near.toLowerCase())) return { dropped: "area" };
  if (f.within && straightLineMeters(f.within.point, e.venue) / 1000 > f.within.km) return { dropped: "distance" };

  const qty = Math.max(1, f.partySize ?? 1);
  let reason: DropReason = "date";
  const upcoming = e.sessions.filter((s) => !s.cancelled && s.start > f.nowLocal);
  const inDates = upcoming.filter((s) => !f.range || inRange(s.start.slice(0, 10), f.range));
  if (!inDates.length) return { dropped: "date" };
  const inTime = inDates.filter(
    (s) =>
      (!f.timeOfDay || f.timeOfDay === "any" || timeOfDayOf(s.start.slice(11, 16)) === f.timeOfDay) &&
      (!f.minStartTime || s.start.slice(11, 16) >= f.minStartTime),
  );
  if (!inTime.length) return { dropped: "time" };

  const matches: { s: Session; tier: Tier | null }[] = [];
  for (const s of inTime) {
    const sm = sold[s.id] ?? {};
    const tier = cheapestTier(s, sm, qty);
    if (!tier) {
      const anySeat = s.tiers.some((t) => remaining(t, sm) > 0);
      reason = anySeat ? "party" : "sold-out";
      if (f.includeSoldOut) matches.push({ s, tier: null });
      continue;
    }
    if (f.maxPrice != null && tier.price + bookingFee(tier.price, feeRule, e.currency) > f.maxPrice) {
      reason = "price";
      continue;
    }
    matches.push({ s, tier });
  }
  if (!matches.length) return { dropped: reason };
  const first = matches.find((m) => m.tier) ?? matches[0];
  const av = sessionAvailability(first.s, sold[first.s.id] ?? {}, f.nowLocal);
  return {
    offer: {
      event: e,
      session: first.s,
      sessionCount: matches.length,
      tier: first.tier,
      fromPrice: first.tier?.price ?? null,
      fee: first.tier ? bookingFee(first.tier.price, feeRule, e.currency) : null,
      availability: av.status,
      left: av.left,
    },
  };
}

export function discover(
  events: OfferEvent[],
  sold: Record<string, SoldMap>,
  f: DiscoveryFilter,
  feeRuleFor: (cityId: string) => FeeRule,
): { offers: Offer[]; dropped: Partial<Record<DropReason, number>> } {
  const offers: Offer[] = [];
  const dropped: Partial<Record<DropReason, number>> = {};
  for (const e of events) {
    if (e.cityId !== f.cityId) continue;
    const r = evaluate(e, sold, f, feeRuleFor(e.cityId));
    if ("offer" in r) offers.push(r.offer);
    else dropped[r.dropped] = (dropped[r.dropped] ?? 0) + 1;
  }
  return { offers, dropped };
}

export type SortMode = "relevance" | "soonest" | "price";

/**
 * Order offers. `tasteRank` maps eventId → 0-based position from Qloo (lower is better); events
 * without a taste signal keep date order after the ranked ones. Never used to filter.
 */
export function sortOffers(offers: Offer[], mode: SortMode, tasteRank?: Map<string, number>): Offer[] {
  const bySoonest = (a: Offer, b: Offer) => a.session.start.localeCompare(b.session.start);
  const copy = [...offers];
  if (mode === "price") return copy.sort((a, b) => (a.fromPrice ?? Infinity) - (b.fromPrice ?? Infinity) || bySoonest(a, b));
  if (mode === "relevance" && tasteRank?.size) {
    return copy.sort((a, b) => {
      const ra = tasteRank.get(a.event.id) ?? Infinity;
      const rb = tasteRank.get(b.event.id) ?? Infinity;
      return ra === rb ? bySoonest(a, b) : ra - rb;
    });
  }
  return copy.sort(bySoonest);
}

export const DROP_COPY: Record<DropReason, string> = {
  date: "no sessions in your dates",
  time: "not at that time of day",
  price: "over your budget (incl. fees)",
  "sold-out": "sold out",
  category: "a different category",
  keyword: "didn't match your search words",
  area: "outside the area",
  distance: "too far",
  party: "not enough seats together",
};
