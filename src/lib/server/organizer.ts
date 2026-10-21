/**
 * Organizer workspace: identity (cookie-based, no accounts), event editing with inventory
 * consistency, publication, and proposals to matching wishes.
 */
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CATEGORIES } from "@/lib/categories";
import { LAYOUTS, sectionCapacity, sections } from "@/lib/seating";
import { EventSchema, type OfferEvent, type Organizer } from "@/lib/events";
import { cityById } from "@/lib/locations";
import { addMinutesLocal } from "@/lib/tz";
import { getEvent, getOrganizer, reservedKey, sampleOrganizers } from "./catalog";
import { accountForSession, SESSION_COOKIE } from "./auth";
import { newId, putDoc, store } from "./store";
import { attachProposal } from "./wishes";
import { QlooUnavailable, searchEntities, searchTags } from "./qloo";
import type { EventMapping } from "./taste";

const CATEGORY_TAG: Record<string, string> = {
  Music: "Live Music", Movies: "Film", Comedy: "Stand-Up Comedy", Theatre: "Theatre", Performances: "Performance Art",
  "Workshops & classes": "Workshops", "Treks & outdoors": "Hiking", Meetups: "Social", Kids: "Family", Sports: "Sports",
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Map organizer-provided attributes to Qloo. Performers become direct artist mappings only on an
 * exact-name match; the activity maps to the closest Qloo tag (approximate). Failures leave the
 * event unmapped but fully discoverable.
 */
async function resolveMappings(input: { category: string; show?: { performers: string[] }; movie?: unknown; title: string }): Promise<EventMapping[]> {
  const out: EventMapping[] = [];
  try {
    for (const name of (input.show?.performers ?? []).slice(0, 3)) {
      const hit = (await searchEntities(name, ["urn:entity:artist"], 3)).find((e) => norm(e.name) === norm(name));
      if (hit) out.push({ qlooId: hit.entity_id, qlooName: hit.name, qlooType: "urn:entity:artist", match: "direct", note: "Performer listed by the organizer (exact name match)", relation: "performer" });
    }
    if (input.movie) {
      const hit = (await searchEntities(input.title, ["urn:entity:movie"], 3)).find((e) => norm(e.name) === norm(input.title));
      if (hit) out.push({ qlooId: hit.entity_id, qlooName: hit.name, qlooType: "urn:entity:movie", match: "direct", note: "Film title matches the listing", relation: "screening" });
    }
    const tagName = CATEGORY_TAG[input.category];
    const tag = tagName ? (await searchTags(tagName, 5)).find((t) => /:genre:|:category:|:activities:|:subgenre:/.test(t.tag_id ?? t.id ?? "")) : undefined;
    if (tag) out.push({ qlooId: (tag.tag_id ?? tag.id)!, qlooName: tag.name.trim(), qlooType: "tag", match: "approximate", note: `Closest Qloo tag to the event's category (${input.category})` });
  } catch (e) {
    if (!(e instanceof QlooUnavailable)) throw e;
  }
  return out;
}

export type CurrentOrg = Organizer & { isSample: boolean; account: { name: string; email: string; demo: boolean } };

/** The organization of the signed-in organizer account, or null when nobody is signed in. */
export async function currentOrg(): Promise<CurrentOrg | null> {
  const account = await accountForSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!account) return null;
  const org = await getOrganizer(account.orgId);
  if (!org) return null;
  return { ...org, isSample: sampleOrganizers().some((o) => o.id === org.id), account: { name: account.name, email: account.email, demo: !!account.demo } };
}

/** For organizer pages: redirect to sign-in when not signed in. */
export async function requireOrgPage(next = "/organizer"): Promise<CurrentOrg> {
  const org = await currentOrg();
  if (!org) redirect(`/organizer/login?next=${encodeURIComponent(next)}`);
  return org;
}

export async function updateOrg(org: Organizer, patch: { name?: string; about?: string; cityId?: string }) {
  const next = { ...org, ...patch };
  await putDoc("organizers", next);
  return next;
}

export async function orgEvents(orgId: string, all: OfferEvent[]) {
  return all.filter((e) => e.organizerId === orgId);
}

export const canEdit = (e: OfferEvent, orgId: string) => e.source === "organizer" && e.organizerId === orgId;

/* ── Event form input ── */

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");
const HHMM = z.string().regex(/^\d{2}:\d{2}$/, "Use a valid time");
const lines = z.array(z.string().trim().min(1).max(200)).max(20);

export const EventInputSchema = z
  .object({
    title: z.string().trim().min(3, "Title is too short").max(90),
    category: z.enum(CATEGORIES),
    cityId: z.string().refine((id) => !!cityById(id), "Choose a supported city"),
    summary: z.string().trim().min(5, "Add a one-line summary").max(120),
    description: z.string().trim().min(20, "Describe the event in a sentence or two").max(2000),
    whatYoullDo: lines,
    audience: z.string().trim().max(300).optional(),
    venue: z.object({ name: z.string().trim().min(2, "Venue name is required").max(80), area: z.string().trim().min(2, "Area is required").max(60), address: z.string().trim().max(160).optional(), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
    durationMin: z.number().int().min(15, "At least 15 minutes").max(24 * 60),
    facts: z.object({ beginnerFriendly: z.boolean().optional(), materialsIncluded: z.boolean().optional(), soloFriendly: z.boolean().optional(), familyFriendly: z.boolean().optional(), ageMin: z.number().int().min(0).max(25).optional() }),
    inclusions: lines.optional(),
    exclusions: lines.optional(),
    bring: lines.optional(),
    restrictions: lines.optional(),
    cancellation: z.string().trim().max(400).optional(),
    movie: z.object({ language: z.string().min(2), subtitles: z.string().optional(), runtimeMin: z.number().int().min(1).optional(), certification: z.string().optional() }).optional(),
    seatLayout: z.string().optional(),
    show: z.object({ performers: z.array(z.string().trim().min(1)).min(1, "Add at least one performer"), doorsBeforeMin: z.number().int().min(0).max(240).optional(), seating: z.string().optional() }).optional(),
    class: z.object({ level: z.string().min(2), materials: z.string().optional(), durationMin: z.number().int().min(15) }).optional(),
    trek: z.object({ difficulty: z.string().min(2), distanceKm: z.number().positive().optional(), elevationM: z.number().nonnegative().optional(), meetingPoint: z.string().min(3), transport: z.string().min(2), equipment: lines, itinerary: z.array(z.object({ time: HHMM, step: z.string().min(2) })).max(20) }).optional(),
    image: z.string().regex(/^\/images\/(events\/)?[a-z0-9-]+\.jpg$/),
    status: z.enum(["draft", "published"]),
    proposedForCluster: z.string().max(200).optional(),
    sessions: z
      .array(
        z.object({
          id: z.string().optional(),
          date: Day,
          time: HHMM,
          cancelled: z.boolean().optional(),
          tiers: z.array(z.object({ id: z.string().optional(), name: z.string().trim().min(1, "Name each ticket type").max(40), price: z.number().nonnegative().max(1_000_000), capacity: z.number().int().min(1, "Capacity must be at least 1").max(100_000) })).min(1, "Add at least one ticket type"),
        }),
      )
      .min(1, "Add at least one date"),
  })
  .superRefine((v, ctx) => {
    if (v.category === "Movies" && !v.movie) ctx.addIssue({ code: "custom", path: ["movie"], message: "Add film details" });
    if (v.category === "Treks & outdoors" && !v.trek) ctx.addIssue({ code: "custom", path: ["trek"], message: "Add trek details" });
    if (v.category === "Workshops & classes" && !v.class) ctx.addIssue({ code: "custom", path: ["class"], message: "Add class details" });
    if (v.seatLayout) {
      const layout = LAYOUTS[v.seatLayout];
      if (!layout) ctx.addIssue({ code: "custom", path: ["seatLayout"], message: "Unknown seating layout" });
      else
        v.sessions.forEach((s, i) =>
          s.tiers.forEach((t, j) => {
            if (!sections(layout).includes(t.name)) ctx.addIssue({ code: "custom", path: ["sessions", i, "tiers", j, "name"], message: `With reserved seating, ticket types must be the layout's sections: ${sections(layout).join(", ")}` });
          }),
        );
    }
  });
export type EventInput = z.infer<typeof EventInputSchema>;

export class InventoryConflict extends Error {}

/**
 * Create or update an organizer event. Existing reservations constrain edits: a session with
 * reservations can't be moved or removed (cancel it instead), and a tier can't drop below the
 * seats already reserved.
 */
export async function saveEvent(orgId: string, input: EventInput, existingId?: string): Promise<{ event: OfferEvent; proposals?: { matched: number; seedMatches: number } }> {
  const prev = existingId ? await getEvent(existingId) : null;
  if (existingId && (!prev || !canEdit(prev, orgId))) throw new InventoryConflict("You can only edit events your organization created.");
  const city = cityById(input.cityId)!;
  const id = prev?.id ?? newId("evt");

  const sessions = [];
  for (const s of input.sessions) {
    const start = `${s.date}T${s.time}`;
    const old = s.id ? prev?.sessions.find((x) => x.id === s.id) : undefined;
    const reserved = old ? ((await store().get<Record<string, number>>(reservedKey(old.id))) ?? {}) : {};
    const hasReservations = Object.values(reserved).some((n) => n > 0);
    if (old && hasReservations && old.start !== start) throw new InventoryConflict(`The ${old.start.replace("T", " ")} session has reservations, so its time can't change. Cancel it and add a new date instead.`);
    const tiers = s.tiers.map((t) => {
      const oldTier = t.id ? old?.tiers.find((x) => x.id === t.id) : undefined;
      const r = oldTier ? (reserved[oldTier.id] ?? 0) : 0;
      if (t.capacity < r) throw new InventoryConflict(`“${t.name}” already has ${r} reserved, so capacity can't go below ${r}.`);
      const capacity = input.seatLayout && LAYOUTS[input.seatLayout] ? sectionCapacity(LAYOUTS[input.seatLayout], t.name) : t.capacity;
      if (capacity < r) throw new InventoryConflict(`“${t.name}” already has ${r} reserved, so capacity can't go below ${r}.`);
      return { id: oldTier?.id ?? newId("t"), name: t.name, price: t.price, capacity, seedSold: 0 };
    });
    if (old && hasReservations) {
      for (const ot of old.tiers) if ((reserved[ot.id] ?? 0) > 0 && !tiers.some((t) => t.id === ot.id)) throw new InventoryConflict(`“${ot.name}” has reservations and can't be removed.`);
    }
    sessions.push({ id: old?.id ?? newId("ses"), start, end: addMinutesLocal(start, input.durationMin), tiers, cancelled: s.cancelled || undefined });
  }
  if (prev) {
    for (const os of prev.sessions) {
      if (sessions.some((s) => s.id === os.id)) continue;
      const reserved = (await store().get<Record<string, number>>(reservedKey(os.id))) ?? {};
      if (Object.values(reserved).some((n) => n > 0)) throw new InventoryConflict(`The ${os.start.replace("T", " ")} session has reservations and can't be deleted. Mark it cancelled instead.`);
    }
  }

  const event = EventSchema.parse({
    ...input,
    id,
    timezone: city.timezone,
    currency: prev?.currency ?? city.currency,
    organizerId: orgId,
    tags: [input.category.toLowerCase(), ...input.title.toLowerCase().split(/\W+/).filter((w) => w.length > 3)].slice(0, 8),
    qlooRefs: [],
    qlooMappings: await resolveMappings(input),
    source: "organizer",
    sessions,
  });
  await putDoc("events", event);
  let proposals;
  if (event.status === "published" && event.proposedForCluster && prev?.status !== "published") {
    const minPrice = Math.min(...event.sessions.flatMap((s) => s.tiers.map((t) => t.price)));
    proposals = await attachProposal(event, Number.isFinite(minPrice) ? minPrice : null);
  }
  return { event, proposals };
}
