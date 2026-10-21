/**
 * Planning assistant engine (pure). Deterministic code decides feasibility; taste only orders
 * feasible options. Nothing is relaxed automatically: when no option fits, the result explains
 * which constraints block and what specific change would open options up.
 */
import type { Category } from "./categories";
import { cheapestTier, remaining, type FeeRule, type OfferEvent, type SoldMap, type Tier } from "./events";
import { straightLineMeters, walkMeters, walkMinutes, type LatLng } from "./geo";
import { matchesKeywords } from "./discovery";
import { bookingFee } from "./pricing";
import { addMinutesLocal } from "./tz";

export type Restaurant = { id: string; name: string; cityId: string; area: string; lat: number; lng: number; costPerPerson: number; currency: string; opens: string; closes: string };

export type PlanRequest = {
  cityId: string;
  from: string; // YYYY-MM-DD (venue-local)
  to: string;
  earliest?: string | null; // HH:mm earliest start
  latest?: string | null; // HH:mm latest start
  area?: { name: string; lat: number; lng: number } | null;
  maxKm?: number | null;
  budget: { amount: number | null; mode: "per-person" | "total" };
  party: number;
  categories: Category[];
  keywords: string[];
  dinner: boolean;
  /** Revisions (all optional; always combined with everything above). */
  maxPerPerson?: number | null; // strictly-cheaper revision
  startBefore?: string | null; // local datetime
  startAfter?: string | null;
  excludeCategories?: Category[];
  excludeEventIds?: string[];
  excludeRestaurantIds?: string[];
  /** Keep this exact session (used when replacing only the dinner). */
  pinSessionId?: string | null;
  /** Demo control: sessions treated as sold out. */
  simulatedSoldOut?: string[];
};

export type Check = { label: string; ok: boolean; detail: string };
export type Candidate = {
  event: OfferEvent;
  sessionId: string;
  start: string;
  end: string;
  tier: Tier;
  seatsLeft: number;
  ticketPrice: number;
  feePerTicket: number;
  bookingTotal: number; // tickets + fees for the party
  dinner: { restaurant: Restaurant; start: string; walkM: number; estimate: number } | null;
  dinnerUnavailable: boolean;
  perPerson: number; // (booking + dinner estimate) / party
  total: number;
  distanceKm: number | null;
};
export type PlanOption = Candidate & { labels: string[]; tradeoffs: string[]; checks: Check[] };

export type Blocker = { constraint: "dates" | "time" | "budget" | "seats" | "distance" | "activity" | "dinner"; count: number; suggestion: string };
export type PlanResult = { options: PlanOption[]; feasibleCount: number; blockers: Blocker[]; considered: number };

const DINNER_SLOT = 15;
const roundUp = (local: string, step: number) => {
  const m = Number(local.slice(14, 16));
  const add = (step - (m % step)) % step;
  return addMinutesLocal(local, add);
};
const round2 = (n: number) => Math.round(n * 100) / 100;

export function budgetPerPerson(r: PlanRequest): number | null {
  if (r.budget.amount === null) return null;
  return r.budget.mode === "total" ? r.budget.amount / Math.max(1, r.party) : r.budget.amount;
}

/** Open on arrival with at least an hour before closing (handles places that close after midnight). */
export function openForDinner(r: Pick<Restaurant, "opens" | "closes">, arrive: string) {
  const at = arrive.slice(11, 16);
  const hourLater = addMinutesLocal(arrive, 60);
  if (r.closes < r.opens) return at >= r.opens || hourLater.slice(11, 16) <= r.closes; // e.g. 12:00–02:00
  return at >= r.opens && hourLater.slice(0, 10) === arrive.slice(0, 10) && hourLater.slice(11, 16) <= r.closes;
}

function pickDinner(e: OfferEvent, end: string, restaurants: Restaurant[], exclude: Set<string>) {
  const options = restaurants
    .filter((r) => r.cityId === e.cityId && !exclude.has(r.id))
    .map((r) => {
      const walkM = walkMeters(e.venue, r); // estimate: straight line x 1.3
      const start = roundUp(addMinutesLocal(end, Math.ceil(walkMinutes(walkM))), DINNER_SLOT);
      return { r, walkM, start };
    })
    .filter((x) => x.walkM <= 2000 && openForDinner(x.r, x.start))
    .sort((a, b) => a.walkM - b.walkM);
  return options[0] ?? null;
}

type Reason = Blocker["constraint"];

export function plan(
  r: PlanRequest,
  events: OfferEvent[],
  sold: Record<string, SoldMap>,
  feeRuleFor: (cityId: string) => FeeRule,
  restaurants: Restaurant[],
  nowLocal: string,
  tasteRank?: Map<string, number>,
): PlanResult {
  const party = Math.max(1, r.party);
  const cap = budgetPerPerson(r);
  const maxPP = r.maxPerPerson != null ? Math.min(cap ?? Infinity, r.maxPerPerson) : cap;
  const simSold = new Set(r.simulatedSoldOut ?? []);
  const exclEvents = new Set(r.excludeEventIds ?? []);
  const exclCats = new Set(r.excludeCategories ?? []);
  const exclRest = new Set(r.excludeRestaurantIds ?? []);
  const reasons: Record<Reason, number> = { dates: 0, time: 0, budget: 0, seats: 0, distance: 0, activity: 0, dinner: 0 };
  const near: Partial<Record<Reason, number>> = {}; // smallest relaxation that would help
  const feasible: Candidate[] = [];
  let considered = 0;

  for (const e of events) {
    if (e.cityId !== r.cityId || e.status !== "published" || exclEvents.has(e.id)) continue;
    considered++;
    if ((r.categories.length && !r.categories.includes(e.category)) || exclCats.has(e.category) || !matchesKeywords(e, r.keywords)) {
      reasons.activity++;
      continue;
    }
    const distanceKm = r.area ? straightLineMeters(r.area as LatLng, e.venue) / 1000 : null;
    if (distanceKm !== null && r.maxKm != null && distanceKm > r.maxKm) {
      reasons.distance++;
      near.distance = Math.min(near.distance ?? Infinity, Math.ceil(distanceKm));
      continue;
    }
    let reason: Reason = "dates";
    let found = false;
    for (const s of e.sessions) {
      if (s.cancelled || s.start <= nowLocal) continue;
      if (r.pinSessionId && s.id !== r.pinSessionId) continue;
      const day = s.start.slice(0, 10);
      if (day < r.from || day > r.to) continue;
      const hhmm = s.start.slice(11, 16);
      if ((r.earliest && hhmm < r.earliest) || (r.latest && hhmm > r.latest) || (r.startBefore && s.start >= r.startBefore) || (r.startAfter && s.start <= r.startAfter)) {
        if (reason === "dates") reason = "time";
        continue;
      }
      const sm = simSold.has(s.id) ? Object.fromEntries(s.tiers.map((t) => [t.id, t.capacity])) : (sold[s.id] ?? {});
      const tier = cheapestTier(s, sm, party);
      if (!tier) {
        if (reason !== "budget") reason = "seats";
        continue;
      }
      const fee = bookingFee(tier.price, feeRuleFor(e.cityId), e.currency);
      const bookingTotal = round2((tier.price + fee) * party);
      let dinner: Candidate["dinner"] = null;
      let dinnerUnavailable = false;
      if (r.dinner) {
        const d = pickDinner(e, s.end, restaurants, exclRest);
        if (d) dinner = { restaurant: d.r, start: d.start, walkM: d.walkM, estimate: d.r.costPerPerson * party };
        else dinnerUnavailable = true;
      }
      const total = round2(bookingTotal + (dinner?.estimate ?? 0));
      const perPerson = round2(total / party);
      if (maxPP != null && perPerson > maxPP) {
        reason = "budget";
        near.budget = Math.min(near.budget ?? Infinity, perPerson);
        continue;
      }
      found = true;
      feasible.push({
        event: e,
        sessionId: s.id,
        start: s.start,
        end: s.end,
        tier,
        seatsLeft: remaining(tier, sm),
        ticketPrice: tier.price,
        feePerTicket: fee,
        bookingTotal,
        dinner,
        dinnerUnavailable,
        perPerson,
        total,
        distanceKm,
      });
    }
    if (!found) reasons[reason]++;
  }

  // One option per event (its best session), ordered by taste then time.
  const bestPerEvent = new Map<string, Candidate>();
  for (const c of feasible.sort((a, b) => a.start.localeCompare(b.start))) if (!bestPerEvent.has(c.event.id)) bestPerEvent.set(c.event.id, c);
  const pool = [...bestPerEvent.values()];
  const ordered = [...pool].sort((a, b) => {
    const ra = tasteRank?.get(a.event.id) ?? Infinity;
    const rb = tasteRank?.get(b.event.id) ?? Infinity;
    return ra === rb ? a.start.localeCompare(b.start) : ra - rb;
  });

  // Prefer variety: different categories first, then fill.
  const chosen: Candidate[] = [];
  for (const c of ordered) if (chosen.length < 3 && !chosen.some((x) => x.event.category === c.event.category)) chosen.push(c);
  for (const c of ordered) if (chosen.length < 3 && !chosen.includes(c)) chosen.push(c);

  // Labels only when the calculation supports them across *all* feasible options.
  const minTotal = Math.min(...pool.map((c) => c.perPerson));
  const minDist = Math.min(...pool.map((c) => c.distanceKm ?? Infinity));
  const minStart = pool.map((c) => c.start).sort()[0];
  const options: PlanOption[] = chosen.map((c) => {
    const labels: string[] = [];
    if (pool.length > 1 && c.perPerson === minTotal && pool.filter((x) => x.perPerson === minTotal).length === 1) labels.push("Cheapest");
    if (pool.length > 1 && c.distanceKm !== null && c.distanceKm === minDist && pool.filter((x) => x.distanceKm === minDist).length === 1) labels.push("Closest");
    if (pool.length > 1 && c.start === minStart && pool.filter((x) => x.start === minStart).length === 1) labels.push("Earliest");
    const tradeoffs: string[] = [];
    if (pool.length > 1 && c.perPerson > minTotal) tradeoffs.push(`costs ${round2(c.perPerson - minTotal)} more per person than the cheapest option`);
    if (c.distanceKm !== null && Number.isFinite(minDist) && c.distanceKm - minDist >= 0.5) tradeoffs.push(`${(c.distanceKm - minDist).toFixed(1)} km further than the closest`);
    if (c.dinnerUnavailable) tradeoffs.push("no sample restaurant within walking distance is open after it ends");
    const checks: Check[] = [
      { label: "Dates", ok: true, detail: `${c.start.slice(0, 10)} is within ${r.from} – ${r.to}` },
      { label: "Time", ok: true, detail: r.earliest || r.latest ? `Starts ${c.start.slice(11, 16)} (window ${r.earliest ?? "any"}–${r.latest ?? "any"})` : `Starts ${c.start.slice(11, 16)}` },
      { label: "Seats", ok: true, detail: `${c.seatsLeft} left in ${c.tier.name} for ${party} ${party === 1 ? "person" : "people"}` },
      maxPP != null
        ? { label: "Budget", ok: true, detail: `${round2(c.perPerson)} per person${c.dinner ? " incl. dinner estimate" : ""}, limit ${round2(maxPP)}` }
        : { label: "Budget", ok: true, detail: "No budget limit set" },
    ];
    if (r.area) checks.push({ label: "Distance", ok: true, detail: `${c.distanceKm!.toFixed(1)} km straight-line from ${r.area.name}${r.maxKm != null ? ` (limit ${r.maxKm} km)` : ""}, estimate` });
    if (r.categories.length || r.keywords.length) checks.push({ label: "Activity", ok: true, detail: [r.categories.join(", "), r.keywords.join(" ")].filter(Boolean).join(" · ") });
    if (r.dinner) checks.push({ label: "Dinner", ok: !!c.dinner, detail: c.dinner ? `${c.dinner.restaurant.name}, ${Math.round(c.dinner.walkM / 50) * 50} m walk (estimate)` : "No suitable sample restaurant" });
    return { ...c, labels, tradeoffs, checks };
  });

  const blockers: Blocker[] = [];
  if (!options.length) {
    const fmt = (n: number) => Math.ceil(n).toLocaleString("en");
    if (reasons.budget) blockers.push({ constraint: "budget", count: reasons.budget, suggestion: `Raise the per-person budget to at least ${fmt(near.budget!)}${r.dinner ? ", or remove dinner" : ""}.` });
    if (reasons.dates) blockers.push({ constraint: "dates", count: reasons.dates, suggestion: "Widen your dates; these have no sessions in your range." });
    if (reasons.time) blockers.push({ constraint: "time", count: reasons.time, suggestion: "Widen the start-time window." });
    if (reasons.seats) blockers.push({ constraint: "seats", count: reasons.seats, suggestion: `Try fewer than ${party} people, or other dates; not enough seats together.` });
    if (reasons.distance) blockers.push({ constraint: "distance", count: reasons.distance, suggestion: `Increase the distance limit to ${near.distance} km.` });
    if (reasons.activity) blockers.push({ constraint: "activity", count: reasons.activity, suggestion: "Remove an activity filter or search word." });
    blockers.sort((a, b) => b.count - a.count);
  }
  return { options, feasibleCount: pool.length, blockers, considered };
}
