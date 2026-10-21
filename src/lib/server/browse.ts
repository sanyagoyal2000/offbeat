/** Shared server logic for Home and search: parse URL filters, run discovery, apply taste order. */
import "server-only";
import { CATEGORIES, type Category } from "@/lib/categories";
import { TIMES_OF_DAY, parseRangeParams, type DateRange, type TimeOfDay } from "@/lib/dateRange";
import { discover, sortOffers, type DiscoveryFilter, type DropReason, type Offer, type SortMode } from "@/lib/discovery";
import type { Location } from "@/lib/locations";
import { nowIn, todayIn } from "@/lib/tz";
import { feeRuleFor, publishedEvents, soldMaps } from "./catalog";
import { getTaste, rankByTaste, type TasteRanking } from "./taste";

export type BrowseParams = {
  kw: string[];
  category: Category | null;
  range: DateRange | null;
  tonight: boolean;
  time: TimeOfDay;
  max: number | null;
  party: number;
  near: string | null;
  sort: SortMode;
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function readBrowseParams(sp: Record<string, string | string[] | undefined>, hasInterests: boolean): BrowseParams {
  const cat = first(sp.cat);
  const time = first(sp.time) as TimeOfDay | undefined;
  const max = Number(first(sp.max));
  const party = Number(first(sp.party));
  const sort = first(sp.sort) as SortMode | undefined;
  return {
    kw: (first(sp.kw) ?? "").split(/\s+/).map((k) => k.trim().toLowerCase()).filter(Boolean).slice(0, 8),
    category: CATEGORIES.includes(cat as Category) ? (cat as Category) : null,
    range: parseRangeParams(first(sp.from), first(sp.to)),
    tonight: first(sp.tonight) === "1",
    time: TIMES_OF_DAY.includes(time as TimeOfDay) ? (time as TimeOfDay) : "any",
    max: Number.isFinite(max) && first(sp.max) !== undefined && max >= 0 ? max : null,
    party: Number.isInteger(party) && party >= 1 && party <= 10 ? party : 1,
    near: first(sp.near)?.slice(0, 40) || null,
    sort: sort === "soonest" || sort === "price" || sort === "relevance" ? sort : hasInterests ? "relevance" : "soonest",
  };
}

export type BrowseResult = {
  offers: Offer[];
  dropped: Partial<Record<DropReason, number>>;
  taste: TasteRanking;
  today: string;
  nowLocal: string;
  totalInCity: number;
  calendarIndex: { eventId: string; date: string; time: string }[];
};

export async function browse(loc: Location, p: BrowseParams, uid: string): Promise<BrowseResult> {
  const events = await publishedEvents(loc.id);
  const sold = await soldMaps(events);
  const nowLocal = nowIn(loc.timezone);
  const today = todayIn(loc.timezone);
  const base: DiscoveryFilter = {
    cityId: loc.id,
    nowLocal,
    category: p.category,
    keywords: p.kw,
    maxPrice: p.max,
    partySize: p.party,
    near: p.near,
  };
  const range = p.tonight ? { from: today, to: today } : p.range;
  const { offers, dropped } = discover(events, sold, { ...base, range, timeOfDay: p.time, minStartTime: p.tonight ? "17:00" : undefined }, feeRuleFor);

  // Calendar dots/counts: same filters except dates and time of day.
  const undated = discover(events, sold, base, feeRuleFor).offers;
  const undatedIds = new Set(undated.map((o) => o.event.id));
  const calendarIndex = events
    .filter((e) => undatedIds.has(e.id))
    .flatMap((e) => e.sessions.filter((s) => s.start > nowLocal && !s.cancelled).map((s) => ({ eventId: e.id, date: s.start.slice(0, 10), time: s.start.slice(11, 16) })));

  const taste = await getTaste(uid);
  const ranking = p.sort === "relevance" ? await rankByTaste(taste.interests, offers.map((o) => o.event)) : await rankByTaste([], []);
  return {
    offers: sortOffers(offers, p.sort, ranking.rank),
    dropped,
    taste: ranking,
    today,
    nowLocal,
    totalInCity: events.length,
    calendarIndex,
  };
}

/** Budget shortcuts in the destination's currency. */
export function budgetPresets(currency: string): number[] {
  if (currency === "INR") return [500, 1000, 2000, 5000];
  if (["GBP", "EUR", "USD", "CAD", "AUD", "SGD", "CHF", "NZD"].includes(currency)) return [10, 25, 50, 100];
  if (currency === "JPY") return [1500, 3000, 6000, 12000];
  return [10, 25, 50, 100];
}
