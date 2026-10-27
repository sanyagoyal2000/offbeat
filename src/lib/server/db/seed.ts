/**
 * Loads the sample data into the database (all marked is_sample = 1):
 *   data/catalog.json (organizers, events, sessions, tiers), data/qloo-mappings.json (Qloo links),
 *   data/local-acts.json (10 local-act events linked only through "for fans of" artists),
 *   data/films.json, data/restaurants.json, and the sample wishes.
 *
 * Idempotent: ids are stable, re-runs update listing metadata but never touch ticket_tiers.sold
 * (which bookings change), and rows that already exist are left alone otherwise.
 */
import { createHash } from "node:crypto";
import { inArray, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import catalogJson from "../../../../data/catalog.json";
import filmsJson from "../../../../data/films.json";
import localActsJson from "../../../../data/local-acts.json";
import mappingsJson from "../../../../data/qloo-mappings.json";
import restaurantsJson from "../../../../data/restaurants.json";
import { EventSchema, OrganizerSchema, type OfferEvent } from "@/lib/events";
import { sampleWishes } from "@/lib/sampleWishes";
import { eventRows } from "./catalog";
import { db } from "./client";
import { toDbAmount } from "./money";
import { eventQlooLinks, eventSessions, events, films, organizers, restaurants, ticketTiers, users, wishQlooLinks, wishes } from "./schema";
import { wishRows } from "./wishes";

export const SAMPLE_WISH_USER = "sample-wishes";

/** Deterministic UUID (v5-style, SHA-1) so re-seeding produces the same ids. */
export function stableId(name: string) {
  const h = createHash("sha1").update(`offbeat:${name}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

type MappingEntry = { match: "direct" | "approximate" | "unmatched"; qlooId?: string; qlooName?: string; qlooType?: string; note: string; ref: { relation?: string } };

function catalogEvents(): OfferEvent[] {
  const map = mappingsJson as unknown as { refs: Record<string, MappingEntry>; byEvent: Record<string, string[]> };
  return z
    .array(EventSchema)
    .parse(catalogJson.events)
    .map((e) => ({
      ...e,
      qlooMappings: (map.byEvent[e.id] ?? [])
        .map((k) => map.refs[k])
        .filter((m): m is MappingEntry & { qlooId: string; qlooName: string; qlooType: string; match: "direct" | "approximate" } => !!m && m.match !== "unmatched")
        .map((m) => ({ qlooId: m.qlooId, qlooName: m.qlooName, qlooType: m.qlooType, match: m.match, note: m.note, relation: m.ref.relation })),
    }));
}

type LocalAct = {
  id: string;
  organizerId: string;
  title: string;
  venue: OfferEvent["venue"];
  image: string;
  summary: string;
  description: string;
  performers: string[];
  audience: string;
  facts?: OfferEvent["facts"];
  inclusions?: string[];
  restrictions?: string[];
  tags: string[];
  durationMin: number;
  dates: string[];
  tiers: { name: string; price: number; capacity: number }[];
  forFansOf: { id: string; name: string }[];
};

function localActEvents(): OfferEvent[] {
  const { events: acts } = localActsJson as unknown as { events: LocalAct[] };
  return acts.map((a) =>
    EventSchema.parse({
      id: a.id,
      title: a.title,
      category: "Music",
      cityId: "bengaluru-in",
      timezone: "Asia/Kolkata",
      currency: "INR",
      venue: a.venue,
      organizerId: a.organizerId,
      summary: a.summary,
      description: a.description,
      whatYoullDo: [`Hear ${a.performers.join(", ")}`],
      audience: a.audience,
      facts: a.facts ?? {},
      inclusions: a.inclusions,
      restrictions: a.restrictions,
      cancellation: "Organizer policy (sample): full refund up to 48 hours before the show.",
      show: { performers: a.performers, seating: a.audience.split(".")[0] },
      durationMin: a.durationMin,
      image: a.image,
      tags: a.tags,
      qlooRefs: [],
      status: "published",
      source: "sample",
      qlooMappings: a.forFansOf.map((f) => ({ qlooId: f.id, qlooName: f.name, qlooType: "urn:entity:artist", match: "approximate", note: "“For fans of” reference only: this artist is not performing", relation: "for-fans-of" })),
      sessions: a.dates.map((start) => {
        const id = `${a.id}--${start.replace(/[-:]/g, "").replace("T", "-")}`;
        const end = new Date(Date.parse(`${start}:00Z`) + a.durationMin * 60000).toISOString().slice(0, 16);
        return { id, start, end, tiers: a.tiers.map((t, i) => ({ id: `t${i + 1}`, name: t.name, price: t.price, capacity: t.capacity, seedSold: 0 })) };
      }),
    }),
  );
}

/** Catalog tier ids ("t1") repeat per session; database ids must be unique, so they're namespaced by session. */
const withUniqueTierIds = (e: OfferEvent): OfferEvent => ({ ...e, sessions: e.sessions.map((s) => ({ ...s, tiers: s.tiers.map((t) => ({ ...t, id: t.id.startsWith(`${s.id}:`) ? t.id : `${s.id}:${t.id}` })) })) });

const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const excluded = (cols: Record<string, SQLiteColumn>) => Object.fromEntries(Object.entries(cols).map(([k, c]) => [k, sql.raw(`excluded.${c.name}`)])) as Record<string, SQL>;

export type SeedReport = Record<string, { inserted: number; total: number }>;

export async function seedDatabase(opts: { now?: number } = {}): Promise<SeedReport> {
  const d = db();
  const orgs = z.array(OrganizerSchema).parse(catalogJson.organizers);
  const all = [...catalogEvents(), ...localActEvents()].map(withUniqueTierIds);
  const resolvedAt = (localActsJson as { resolvedAt: string }).resolvedAt;
  const rows = all.map((e) => eventRows(e, { isSample: true, resolvedAt }));
  const links = rows.flatMap((r) => r.links.map((l) => ({ ...l, id: stableId(`link:${l.eventId}:${l.qlooEntityId}:${l.linkKind}`) })));
  const filmRows = Object.values((filmsJson as unknown as { films: Record<string, { id: string; title: string; qlooName?: string; year: number; language: string; description: string | null; image: string | null; genres: string[]; qlooId: string | null }> }).films).map((f) => ({
    id: f.id, title: f.title, qlooName: f.qlooName ?? null, qlooId: f.qlooId, year: f.year, language: f.language, description: f.description, imageUrl: f.image, genresJson: JSON.stringify(f.genres),
  }));
  const restaurantRows = (restaurantsJson as unknown as { restaurants: { id: string; name: string; cityId: string; area: string; lat: number; lng: number; costPerPerson: number; currency: string; opens: string; closes: string; tags: string[]; image: string }[] }).restaurants.map((r) => ({
    id: r.id, name: r.name, city: r.cityId, area: r.area, lat: r.lat, lng: r.lng, costPerPersonAmount: toDbAmount(r.costPerPerson, r.currency), currency: r.currency, opens: r.opens, closes: r.closes, tagsJson: JSON.stringify(r.tags), image: r.image,
  }));
  const wishUserId = stableId(`user:${SAMPLE_WISH_USER}`);
  const wishData = sampleWishes(opts.now).map((w) => wishRows({ ...w, userId: wishUserId, isSample: true, createdAt: w.createdAt }));
  const wishLinks = wishData.flatMap((w) => w.links.map((l) => ({ ...l, id: stableId(`wishlink:${l.wishId}:${l.qlooEntityId}`) })));

  // Count what already exists, to report what this run inserted.
  const existing = async (table: typeof events | typeof eventSessions | typeof ticketTiers | typeof organizers | typeof eventQlooLinks | typeof films | typeof restaurants | typeof wishes | typeof wishQlooLinks, ids: string[]) => {
    let n = 0;
    for (const c of chunk(ids, 500)) n += (await d.select({ id: table.id }).from(table).where(inArray(table.id, c))).length;
    return n;
  };
  const plan = {
    organizers: orgs.map((o) => o.id),
    events: rows.map((r) => r.event.id),
    event_sessions: rows.flatMap((r) => r.sessions.map((s) => s.id)),
    ticket_tiers: rows.flatMap((r) => r.tiers.map((t) => t.id)),
    event_qloo_links: links.map((l) => l.id),
    films: filmRows.map((f) => f.id),
    restaurants: restaurantRows.map((r) => r.id),
    wishes: wishData.map((w) => w.wish.id),
    wish_qloo_links: wishLinks.map((l) => l.id),
  };
  const tables = { organizers, events, event_sessions: eventSessions, ticket_tiers: ticketTiers, event_qloo_links: eventQlooLinks, films, restaurants, wishes, wish_qloo_links: wishQlooLinks };
  const before = Object.fromEntries(await Promise.all(Object.entries(plan).map(async ([k, ids]) => [k, await existing(tables[k as keyof typeof tables], ids)])));

  const stmts: BatchItem<"sqlite">[] = [
    d.insert(organizers).values(orgs.map((o) => ({ id: o.id, name: o.name, city: o.cityId, about: o.about, isSample: true }))).onConflictDoUpdate({ target: organizers.id, set: excluded({ name: organizers.name, city: organizers.city, about: organizers.about }) }),
    ...chunk(rows.map((r) => r.event), 100).map((c) =>
      d.insert(events).values(c).onConflictDoUpdate({
        target: events.id,
        set: excluded({ title: events.title, description: events.description, category: events.category, venueName: events.venueName, area: events.area, city: events.city, lat: events.lat, lng: events.lng, startsAt: events.startsAt, endsAt: events.endsAt, capacity: events.capacity, detailsJson: events.detailsJson }),
      }),
    ),
    ...chunk(rows.flatMap((r) => r.sessions), 500).map((c) => d.insert(eventSessions).values(c).onConflictDoUpdate({ target: eventSessions.id, set: excluded({ startsAt: eventSessions.startsAt, endsAt: eventSessions.endsAt }) })),
    // Never overwrite sold / seed_sold on re-runs: bookings may have changed sold.
    ...chunk(rows.flatMap((r) => r.tiers), 500).map((c) => d.insert(ticketTiers).values(c).onConflictDoUpdate({ target: ticketTiers.id, set: excluded({ name: ticketTiers.name, priceAmount: ticketTiers.priceAmount, capacity: ticketTiers.capacity, position: ticketTiers.position }) })),
    ...chunk(links, 500).map((c) => d.insert(eventQlooLinks).values(c).onConflictDoNothing()),
    d.insert(films).values(filmRows).onConflictDoUpdate({ target: films.id, set: excluded({ title: films.title, qlooName: films.qlooName, qlooId: films.qlooId, year: films.year, language: films.language, description: films.description, imageUrl: films.imageUrl, genresJson: films.genresJson }) }),
    d.insert(restaurants).values(restaurantRows).onConflictDoUpdate({ target: restaurants.id, set: excluded({ name: restaurants.name, costPerPersonAmount: restaurants.costPerPersonAmount, opens: restaurants.opens, closes: restaurants.closes, tagsJson: restaurants.tagsJson, image: restaurants.image }) }),
    d.insert(users).values({ id: wishUserId, anonCookieId: SAMPLE_WISH_USER, displayName: "Sample wishes" }).onConflictDoNothing(),
    ...chunk(wishData.map((w) => w.wish), 200).map((c) => d.insert(wishes).values(c).onConflictDoNothing()),
    ...(wishLinks.length ? chunk(wishLinks, 500).map((c) => d.insert(wishQlooLinks).values(c).onConflictDoNothing()) : []),
  ];
  await d.batch(stmts as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);

  return Object.fromEntries(Object.entries(plan).map(([k, ids]) => [k, { inserted: ids.length - before[k], total: ids.length }]));
}
