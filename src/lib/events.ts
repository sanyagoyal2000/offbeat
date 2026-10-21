/**
 * Event model shared by server and client. Sample events come from data/catalog.json;
 * organizer-created events are stored and use the same shape.
 */
import { z } from "zod";
import { CATEGORIES } from "./categories";

export const TierSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  price: z.number().nonnegative(),
  capacity: z.number().int().positive(),
  /** Seats sold before this demo started (sample data only). */
  seedSold: z.number().int().nonnegative().default(0),
});

export const SessionSchema = z.object({
  id: z.string(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/), // venue-local
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  tiers: z.array(TierSchema).min(1),
  cancelled: z.boolean().optional(),
});

export const QlooRefSchema = z.object({
  name: z.string(),
  type: z.enum(["artist", "movie", "book", "place", "tag"]),
  relation: z.enum(["screening", "for-fans-of", "venue", "author"]).optional(),
});

export const EventSchema = z.object({
  id: z.string(),
  title: z.string().min(2),
  category: z.enum(CATEGORIES),
  cityId: z.string(),
  timezone: z.string(),
  currency: z.string().length(3),
  venue: z.object({ name: z.string(), area: z.string(), address: z.string().optional(), lat: z.number(), lng: z.number() }),
  organizerId: z.string(),
  summary: z.string(),
  description: z.string(),
  whatYoullDo: z.array(z.string()).default([]),
  audience: z.string().optional(),
  /** Only explicit, organizer-provided facts. Never inferred. */
  facts: z
    .object({
      beginnerFriendly: z.boolean().optional(),
      materialsIncluded: z.boolean().optional(),
      soloFriendly: z.boolean().optional(),
      familyFriendly: z.boolean().optional(),
      ageMin: z.number().int().optional(),
    })
    .default({}),
  inclusions: z.array(z.string()).optional(),
  exclusions: z.array(z.string()).optional(),
  bring: z.array(z.string()).optional(),
  restrictions: z.array(z.string()).optional(),
  cancellation: z.string().optional(),
  movie: z.object({ language: z.string(), subtitles: z.string().optional(), runtimeMin: z.number().optional(), certification: z.string().optional() }).optional(),
  /** Real film being screened (facts and image from Qloo). */
  film: z.object({ id: z.string(), qlooId: z.string().nullable(), year: z.number(), genres: z.array(z.string()), imageCredit: z.string().optional() }).optional(),
  /** Reserved seating layout id (src/lib/seating.ts); tier names are its sections. */
  seatLayout: z.string().optional(),
  show: z.object({ performers: z.array(z.string()), doorsBeforeMin: z.number().optional(), seating: z.string().optional() }).optional(),
  class: z.object({ level: z.string(), materials: z.string().optional(), durationMin: z.number() }).optional(),
  trek: z
    .object({
      difficulty: z.string(),
      distanceKm: z.number().optional(),
      elevationM: z.number().optional(),
      meetingPoint: z.string(),
      transport: z.string(),
      equipment: z.array(z.string()),
      itinerary: z.array(z.object({ time: z.string(), step: z.string() })),
    })
    .optional(),
  durationMin: z.number(),
  image: z.string(),
  tags: z.array(z.string()).default([]),
  qlooRefs: z.array(QlooRefSchema).default([]),
  status: z.enum(["draft", "published", "archived"]),
  source: z.enum(["sample", "organizer"]),
  /** Qloo mappings resolved when an organizer saves the event (sample events use data/qloo-mappings.json). */
  qlooMappings: z
    .array(z.object({ qlooId: z.string(), qlooName: z.string(), qlooType: z.string(), match: z.enum(["direct", "approximate"]), note: z.string(), relation: z.string().optional() }))
    .optional(),
  /** Wish cluster this event was proposed for, if any. */
  proposedForCluster: z.string().optional(),
  sessions: z.array(SessionSchema),
});

export type Tier = z.infer<typeof TierSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type OfferEvent = z.infer<typeof EventSchema>;

export const FeeRuleSchema = z.object({ rate: z.number(), taxRate: z.number(), taxName: z.string().nullable() });
export type FeeRule = z.infer<typeof FeeRuleSchema>;

export const OrganizerSchema = z.object({ id: z.string(), name: z.string(), cityId: z.string(), about: z.string() });
export type Organizer = z.infer<typeof OrganizerSchema>;

/** Sold seats per tier for one session: seed sales + demo reservations. */
export type SoldMap = Record<string, number>; // tierId -> sold

export const remaining = (tier: Tier, sold: SoldMap) => Math.max(0, tier.capacity - (sold[tier.id] ?? tier.seedSold));

export type Availability = "available" | "few-left" | "sold-out" | "past" | "cancelled";

/** "Few left" only when a computed count is under 10% of capacity (no invented scarcity). */
export function sessionAvailability(session: Session, sold: SoldMap, nowLocal: string): { status: Availability; left: number } {
  if (session.cancelled) return { status: "cancelled", left: 0 };
  if (session.start <= nowLocal) return { status: "past", left: 0 };
  const left = session.tiers.reduce((n, t) => n + remaining(t, sold), 0);
  const cap = session.tiers.reduce((n, t) => n + t.capacity, 0);
  if (left === 0) return { status: "sold-out", left };
  return { status: left / cap < 0.1 ? "few-left" : "available", left };
}

/** Cheapest tier with at least `qty` seats left. */
export function cheapestTier(session: Session, sold: SoldMap, qty = 1): Tier | null {
  return [...session.tiers].filter((t) => remaining(t, sold) >= qty).sort((a, b) => a.price - b.price)[0] ?? null;
}

export const FACT_LABELS: Record<string, string> = {
  beginnerFriendly: "Beginner friendly",
  materialsIncluded: "Materials included",
  soloFriendly: "Good for going solo",
  familyFriendly: "Family friendly",
};

export function factLabels(e: Pick<OfferEvent, "facts">): string[] {
  const out = Object.entries(FACT_LABELS).filter(([k]) => e.facts[k as keyof typeof e.facts]).map(([, v]) => v);
  if (e.facts.ageMin) out.push(`Ages ${e.facts.ageMin}+`);
  return out;
}

/** Short distinguishing detail for cards, from explicit fields only. */
export function cardDetail(e: OfferEvent): string {
  if (e.movie) return [e.movie.language, e.movie.subtitles ? `${e.movie.subtitles} subtitles` : null, e.film?.year, e.seatLayout ? "Reserved seats" : null].filter(Boolean).join(" · ");
  if (e.seatLayout) return "Reserved seats";
  if (e.trek) return [e.trek.difficulty.replace(/ \(.*\)/, ""), e.trek.distanceKm ? `${e.trek.distanceKm} km` : null].filter(Boolean).join(" · ");
  if (e.class) return [e.class.level, e.facts.materialsIncluded ? "Materials included" : null].filter(Boolean).join(" · ");
  if (e.show?.seating) return e.show.seating.split(",")[0];
  return e.summary;
}
