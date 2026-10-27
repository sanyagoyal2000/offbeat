/**
 * Catalog repository: events (+ sessions, ticket tiers, Qloo links), organizers, films, restaurants.
 * Converts between rows and the app's OfferEvent shape. Session times are stored as UTC and
 * returned as venue-local "YYYY-MM-DDTHH:mm", which is what the rest of the app works in.
 */
import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { OfferEvent, Organizer, SoldMap } from "@/lib/events";
import { localToInstant, nowIn } from "@/lib/tz";
import { db, newId, nowIso, runBatch } from "./client";
import { fromDbAmount, toDbAmount } from "./money";
import { bookedSeats, eventQlooLinks, eventSessions, events, films, organizers, restaurants, ticketTiers } from "./schema";

type EventRow = typeof events.$inferSelect;
type SessionRow = typeof eventSessions.$inferSelect;
type TierRow = typeof ticketTiers.$inferSelect;
type LinkRow = typeof eventQlooLinks.$inferSelect;
export type EventMapping = NonNullable<OfferEvent["qlooMappings"]>[number];

/** Listing fields that live in events.details_json. */
const DETAIL_KEYS = ["summary", "whatYoullDo", "audience", "facts", "inclusions", "exclusions", "bring", "restrictions", "cancellation", "movie", "film", "seatLayout", "show", "class", "trek", "durationMin", "image", "tags", "qlooRefs", "proposedForCluster"] as const;

const STATUS_TO_DB = { draft: "draft", published: "published", archived: "cancelled" } as const;
const STATUS_FROM_DB = { draft: "draft", published: "published", sold_out: "published", cancelled: "archived" } as const;

export const toUtc = (local: string, timezone: string) => localToInstant(local, timezone).toISOString();
export const toLocal = (iso: string, timezone: string) => nowIn(timezone, new Date(iso));

const LINK_TO_RELATION = { for_fans_of: "for-fans-of", film: "screening", performer: "performer", tag: undefined } as const;

export function linkToMapping(l: LinkRow): EventMapping {
  return { qlooId: l.qlooEntityId, qlooName: l.name, qlooType: l.qlooType, match: l.matchQuality === "exact" ? "direct" : "approximate", note: l.note, relation: LINK_TO_RELATION[l.linkKind] };
}

export function mappingToLinkKind(m: EventMapping): LinkRow["linkKind"] {
  if (m.qlooType === "tag") return "tag";
  if (m.relation === "performer") return "performer";
  if (m.qlooType === "urn:entity:movie" || m.relation === "screening") return "film";
  return "for_fans_of";
}

function toEvent(e: EventRow, sessions: SessionRow[], tiers: TierRow[], links: LinkRow[]): OfferEvent {
  const d = JSON.parse(e.detailsJson) as Record<string, unknown>;
  return {
    id: e.id,
    title: e.title,
    category: e.category as OfferEvent["category"],
    cityId: e.city,
    timezone: e.timezone,
    currency: e.currency,
    venue: { name: e.venueName, area: e.area, ...(e.address ? { address: e.address } : {}), lat: e.lat, lng: e.lng },
    organizerId: e.organizerId,
    description: e.description,
    ...(d as Pick<OfferEvent, (typeof DETAIL_KEYS)[number]>),
    whatYoullDo: (d.whatYoullDo as string[]) ?? [],
    facts: (d.facts as OfferEvent["facts"]) ?? {},
    tags: (d.tags as string[]) ?? [],
    qlooRefs: (d.qlooRefs as OfferEvent["qlooRefs"]) ?? [],
    status: STATUS_FROM_DB[e.status],
    source: e.isSample ? "sample" : "organizer",
    qlooMappings: links.map(linkToMapping),
    sessions: sessions.map((s) => ({
      id: s.id,
      start: toLocal(s.startsAt, e.timezone),
      end: toLocal(s.endsAt, e.timezone),
      ...(s.isCancelled ? { cancelled: true } : {}),
      tiers: tiers.filter((t) => t.sessionId === s.id).map((t) => ({ id: t.id, name: t.name, price: fromDbAmount(t.priceAmount, e.currency), capacity: t.capacity, seedSold: t.seedSold })),
    })),
  };
}

/** Sold seats per tier, captured when events are loaded (avoids a second round trip). */
const soldByEvent = new WeakMap<OfferEvent, Record<string, SoldMap>>();

type Where = { city?: string; status?: OfferEvent["status"]; ids?: string[]; organizerId?: string };

/** Loads events with their sessions, tiers and Qloo links in one batched round trip. */
export async function loadEvents(where: Where = {}): Promise<OfferEvent[]> {
  if (where.ids && !where.ids.length) return [];
  const conds = [
    where.city ? eq(events.city, where.city) : undefined,
    where.status ? (where.status === "published" ? inArray(events.status, ["published", "sold_out"]) : eq(events.status, STATUS_TO_DB[where.status])) : undefined,
    where.ids ? inArray(events.id, where.ids) : undefined,
    where.organizerId ? eq(events.organizerId, where.organizerId) : undefined,
  ].filter((c) => c !== undefined);
  const filter = conds.length ? and(...conds) : undefined;
  const sub = db().select({ id: events.id }).from(events).where(filter);
  const [rows, sessions, tiers, links] = await db().batch([
    db().select().from(events).where(filter).orderBy(asc(events.startsAt), asc(events.id)),
    db().select().from(eventSessions).where(inArray(eventSessions.eventId, sub)).orderBy(asc(eventSessions.startsAt)),
    db().select().from(ticketTiers).where(inArray(ticketTiers.eventId, sub)).orderBy(asc(ticketTiers.position)),
    // Insertion order (rowid) keeps links in the order they were defined.
    db().select().from(eventQlooLinks).where(inArray(eventQlooLinks.eventId, sub)).orderBy(sql`rowid`),
  ]);
  const group = <T extends { eventId: string }>(xs: T[]) => {
    const m = new Map<string, T[]>();
    for (const x of xs) m.set(x.eventId, [...(m.get(x.eventId) ?? []), x]);
    return m;
  };
  const s = group(sessions);
  const t = group(tiers);
  const l = group(links);
  return rows.map((r) => {
    const ev = toEvent(r, s.get(r.id) ?? [], t.get(r.id) ?? [], l.get(r.id) ?? []);
    const sold: Record<string, SoldMap> = {};
    for (const tier of t.get(r.id) ?? []) (sold[tier.sessionId] ??= {})[tier.id] = tier.sold;
    soldByEvent.set(ev, sold);
    return ev;
  });
}

export async function getEventById(id: string): Promise<OfferEvent | null> {
  return (await loadEvents({ ids: [id] }))[0] ?? null;
}

/** Sold seats per session → tier. Uses the counts captured at load time when available. */
export async function soldFor(evs: OfferEvent[]): Promise<Record<string, SoldMap>> {
  const out: Record<string, SoldMap> = {};
  const missing: string[] = [];
  for (const e of evs) {
    const cached = soldByEvent.get(e);
    if (cached) Object.assign(out, cached);
    else missing.push(e.id);
  }
  if (missing.length) {
    const rows = await db().select({ id: ticketTiers.id, sessionId: ticketTiers.sessionId, sold: ticketTiers.sold }).from(ticketTiers).where(inArray(ticketTiers.eventId, missing));
    for (const r of rows) (out[r.sessionId] ??= {})[r.id] = r.sold;
  }
  return out;
}

/** Fresh sold counts for one session (no load-time cache). */
export async function soldForSession(sessionId: string): Promise<SoldMap> {
  const rows = await db().select({ id: ticketTiers.id, sold: ticketTiers.sold }).from(ticketTiers).where(eq(ticketTiers.sessionId, sessionId));
  return Object.fromEntries(rows.map((r) => [r.id, r.sold]));
}

/** Seats taken through bookings in a reserved-seating session. */
export async function bookedSeatIds(sessionId: string): Promise<string[]> {
  return (await db().select({ seat: bookedSeats.seat }).from(bookedSeats).where(eq(bookedSeats.sessionId, sessionId))).map((r) => r.seat);
}

/** Seats reserved through bookings, per tier (sold minus sample pre-sales), for organizer edit checks. */
export async function reservedByTier(sessionIds: string[]): Promise<Record<string, Record<string, number>>> {
  if (!sessionIds.length) return {};
  const rows = await db().select({ id: ticketTiers.id, sessionId: ticketTiers.sessionId, n: sql<number>`${ticketTiers.sold} - ${ticketTiers.seedSold}` }).from(ticketTiers).where(inArray(ticketTiers.sessionId, sessionIds));
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) (out[r.sessionId] ??= {})[r.id] = r.n;
  return out;
}

export async function citiesWithPublishedEvents(): Promise<Set<string>> {
  const rows = await db().selectDistinct({ city: events.city }).from(events).where(inArray(events.status, ["published", "sold_out"]));
  return new Set(rows.map((r) => r.city));
}

/** Rows for one event, ready to insert or upsert. Shared by organizer saves and the seed. */
export function eventRows(e: OfferEvent, opts: { isSample: boolean; resolvedAt?: string }) {
  const details = Object.fromEntries(DETAIL_KEYS.filter((k) => e[k] !== undefined).map((k) => [k, e[k]]));
  const live = e.sessions.filter((s) => !s.cancelled);
  const span = (live.length ? live : e.sessions).map((s) => [toUtc(s.start, e.timezone), toUtc(s.end, e.timezone)]);
  const event = {
    id: e.id,
    organizerId: e.organizerId,
    title: e.title,
    description: e.description,
    category: e.category,
    venueName: e.venue.name,
    area: e.venue.area,
    address: e.venue.address ?? null,
    city: e.cityId,
    lat: e.venue.lat,
    lng: e.venue.lng,
    timezone: e.timezone,
    currency: e.currency,
    startsAt: span.length ? span.map((x) => x[0]).sort()[0] : null,
    endsAt: span.length ? span.map((x) => x[1]).sort().at(-1)! : null,
    capacity: e.sessions.reduce((n, s) => n + s.tiers.reduce((m, t) => m + t.capacity, 0), 0),
    status: STATUS_TO_DB[e.status],
    isSample: opts.isSample,
    detailsJson: JSON.stringify(details),
    updatedAt: nowIso(),
  };
  const sessions = e.sessions.map((s) => ({ id: s.id, eventId: e.id, startsAt: toUtc(s.start, e.timezone), endsAt: toUtc(s.end, e.timezone), isCancelled: !!s.cancelled, updatedAt: nowIso() }));
  const tiers = e.sessions.flatMap((s) => s.tiers.map((t, i) => ({ id: t.id, eventId: e.id, sessionId: s.id, name: t.name, priceAmount: toDbAmount(t.price, e.currency), capacity: t.capacity, sold: t.seedSold, seedSold: t.seedSold, position: i, updatedAt: nowIso() })));
  const links = (e.qlooMappings ?? []).map((m) => ({
    id: newId(),
    eventId: e.id,
    qlooEntityId: m.qlooId,
    qlooType: m.qlooType,
    name: m.qlooName,
    linkKind: mappingToLinkKind(m),
    matchQuality: m.match === "direct" ? ("exact" as const) : ("approximate" as const),
    note: m.note,
    resolvedAt: opts.resolvedAt ?? nowIso(),
  }));
  return { event, sessions, tiers, links };
}

/**
 * Create or update an organizer event in one transaction. Tier `sold` counts are never overwritten
 * (only bookings change them); removed sessions are deleted with their tiers. Callers check that
 * removed sessions and tiers have no bookings first.
 */
export async function saveEvent(e: OfferEvent) {
  const { event, sessions, tiers, links } = eventRows(e, { isSample: e.source === "sample" });
  const d = db();
  const keepSessions = sessions.map((s) => s.id);
  const keepTiers = tiers.map((t) => t.id);
  await runBatch([
    d.insert(events).values(event).onConflictDoUpdate({ target: events.id, set: { ...event, id: undefined } }),
    d.delete(ticketTiers).where(and(eq(ticketTiers.eventId, e.id), notInArray(ticketTiers.id, keepTiers))),
    d.delete(eventSessions).where(and(eq(eventSessions.eventId, e.id), notInArray(eventSessions.id, keepSessions))),
    ...sessions.map((s) => d.insert(eventSessions).values(s).onConflictDoUpdate({ target: eventSessions.id, set: { startsAt: s.startsAt, endsAt: s.endsAt, isCancelled: s.isCancelled, updatedAt: s.updatedAt } })),
    ...tiers.map((t) => d.insert(ticketTiers).values(t).onConflictDoUpdate({ target: ticketTiers.id, set: { name: t.name, priceAmount: t.priceAmount, capacity: t.capacity, position: t.position, updatedAt: t.updatedAt } })),
    d.delete(eventQlooLinks).where(eq(eventQlooLinks.eventId, e.id)),
    ...(links.length ? [d.insert(eventQlooLinks).values(links)] : []),
  ]);
}

/* ── Organizers ── */

type OrganizerRow = typeof organizers.$inferSelect;
const toOrganizer = (o: OrganizerRow): Organizer => ({ id: o.id, name: o.name, cityId: o.city, about: o.about });

export async function getOrganizerById(id: string): Promise<(Organizer & { isSample: boolean }) | null> {
  const [o] = await db().select().from(organizers).where(eq(organizers.id, id));
  return o ? { ...toOrganizer(o), isSample: o.isSample } : null;
}

export async function listSampleOrganizers(): Promise<Organizer[]> {
  return (await db().select().from(organizers).where(eq(organizers.isSample, true)).orderBy(asc(organizers.id))).map(toOrganizer);
}

export async function upsertOrganizer(o: Organizer & { contactEmail?: string | null; isSample?: boolean }) {
  const row = { id: o.id, name: o.name, city: o.cityId, about: o.about, contactEmail: o.contactEmail ?? null, isSample: o.isSample ?? false, updatedAt: nowIso() };
  await db().insert(organizers).values(row).onConflictDoUpdate({ target: organizers.id, set: { name: row.name, city: row.city, about: row.about, updatedAt: row.updatedAt } });
}

/* ── Films and restaurants (reference data) ── */

export type FilmInfo = { id: string; title: string; qlooName?: string; year: number; language: string; description: string | null; image: string | null; genres: string[]; qlooId: string | null };

export async function listFilms(): Promise<Record<string, FilmInfo>> {
  const rows = await db().select().from(films);
  return Object.fromEntries(
    rows.map((f) => [f.id, { id: f.id, title: f.title, ...(f.qlooName ? { qlooName: f.qlooName } : {}), year: f.year, language: f.language, description: f.description, image: f.imageUrl, genres: JSON.parse(f.genresJson) as string[], qlooId: f.qlooId }]),
  );
}

export type Restaurant = { id: string; name: string; cityId: string; area: string; lat: number; lng: number; costPerPerson: number; currency: string; opens: string; closes: string; tags: string[]; image: string };

export async function listRestaurants(city?: string): Promise<Restaurant[]> {
  const rows = await db().select().from(restaurants).where(city ? eq(restaurants.city, city) : undefined);
  return rows.map((r) => ({ id: r.id, name: r.name, cityId: r.city, area: r.area, lat: r.lat, lng: r.lng, costPerPerson: fromDbAmount(r.costPerPersonAmount, r.currency), currency: r.currency, opens: r.opens, closes: r.closes, tags: JSON.parse(r.tagsJson) as string[], image: r.image }));
}
