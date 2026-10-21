/**
 * Wishes: what people want that doesn't exist yet. Pure helpers for grouping compatible wishes.
 * Real submissions and seeded demo records are always counted separately.
 */
import { z } from "zod";
import { CATEGORIES, type Category } from "./categories";
import { straightLineMeters } from "./geo";

export const WishInputSchema = z.object({
  text: z.string().trim().max(400).default(""),
  category: z.enum(CATEGORIES).nullable(),
  keywords: z.array(z.string().trim().min(2).max(30)).max(6),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  budgetMax: z.number().nonnegative().max(1_000_000).nullable(),
  currency: z.string().length(3),
  location: z.object({
    cityId: z.string(),
    cityName: z.string(),
    area: z.string().max(60).nullable(),
    lat: z.number(),
    lng: z.number(),
    radiusKm: z.number().min(1).max(100),
  }),
  tasteRefs: z.array(z.object({ id: z.string(), name: z.string() })).max(10),
  notify: z.boolean(),
});
export type WishInput = z.infer<typeof WishInputSchema>;

export type Wish = WishInput & {
  id: string;
  uid: string;
  source: "real" | "seed";
  status: "open" | "proposed" | "withdrawn";
  createdAt: string;
  updatedAt: string;
  proposals: { eventId: string; organizerId: string; at: string }[];
};

/** Two wishes are compatible when every stated constraint overlaps. Missing constraints don't block. */
export function compatible(a: Wish, b: Wish): boolean {
  if (a.location.cityId !== b.location.cityId) return false;
  if (a.category && b.category && a.category !== b.category) return false;
  if (a.keywords.length && b.keywords.length && !a.keywords.some((k) => b.keywords.includes(k))) return false;
  const km = straightLineMeters(a.location, b.location) / 1000;
  if (km > Math.max(a.location.radiusKm, b.location.radiusKm)) return false;
  if (a.from && a.to && b.from && b.to && (a.to < b.from || b.to < a.from)) return false;
  return true;
}

export type WishCluster = {
  key: string;
  cityId: string;
  cityName: string;
  category: Category | null;
  keyword: string | null;
  realCount: number;
  seedCount: number;
  members: Wish[];
  /** Lowest stated budget among members (a price that fits all who gave one). */
  budgetCeiling: number | null;
  budgetsGiven: number;
  currency: string;
  dateWindow: { from: string; to: string } | null;
  center: { lat: number; lng: number };
  radiusKm: number;
  areas: string[];
  tasteRefs: { id: string; name: string; count: number }[];
  explanation: string;
};

const ACTIVE = (w: Wish) => w.status !== "withdrawn";
const isoNow = () => new Date().toISOString().slice(0, 10);

/**
 * Greedy grouping: seed a cluster with the oldest unassigned wish, add every wish compatible with
 * *all* current members. Only opted-in wishes (notify=true) are counted, per the privacy promise.
 */
export function clusterWishes(wishes: Wish[], opts: { cityId?: string; sinceDays?: number; today?: string } = {}): WishCluster[] {
  const today = opts.today ?? isoNow();
  const since = opts.sinceDays ? new Date(Date.parse(today) - opts.sinceDays * 864e5).toISOString().slice(0, 10) : null;
  const pool = wishes
    .filter((w) => ACTIVE(w) && w.notify && (!opts.cityId || w.location.cityId === opts.cityId) && (!since || w.createdAt.slice(0, 10) >= since))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const used = new Set<string>();
  const clusters: WishCluster[] = [];
  for (const seed of pool) {
    if (used.has(seed.id)) continue;
    const members = [seed];
    used.add(seed.id);
    for (const w of pool) {
      if (used.has(w.id) || !members.every((m) => compatible(m, w))) continue;
      members.push(w);
      used.add(w.id);
    }
    const budgets = members.map((m) => m.budgetMax).filter((b): b is number => b !== null);
    const froms = members.map((m) => m.from).filter(Boolean) as string[];
    const tos = members.map((m) => m.to).filter(Boolean) as string[];
    const latestFrom = froms.sort().at(-1);
    const earliestTo = tos.sort()[0];
    const keyword = members.flatMap((m) => m.keywords).sort((a, b) => members.filter((m) => m.keywords.includes(b)).length - members.filter((m) => m.keywords.includes(a)).length)[0] ?? null;
    const category = members.find((m) => m.category)?.category ?? null;
    const refCounts = new Map<string, { id: string; name: string; count: number }>();
    for (const m of members) for (const r of m.tasteRefs) refCounts.set(r.id, { ...r, count: (refCounts.get(r.id)?.count ?? 0) + 1 });
    const center = { lat: members.reduce((n, m) => n + m.location.lat, 0) / members.length, lng: members.reduce((n, m) => n + m.location.lng, 0) / members.length };
    const radiusKm = Math.min(...members.map((m) => m.location.radiusKm));
    const dateWindow = latestFrom && earliestTo && latestFrom <= earliestTo ? { from: latestFrom, to: earliestTo } : null;
    const parts = [
      category ?? "Any activity",
      keyword ? `mentioning “${keyword}”` : null,
      `within ${radiusKm} km of each other's areas`,
      dateWindow ? `everyone free ${dateWindow.from} to ${dateWindow.to}` : "no shared date window stated",
      budgets.length ? `budget up to ${Math.min(...budgets)} ${seed.currency} fits all ${budgets.length} who gave one` : "no budgets stated",
    ].filter(Boolean);
    clusters.push({
      key: `${seed.location.cityId}:${category ?? "any"}:${keyword ?? "any"}:${seed.id}`,
      cityId: seed.location.cityId,
      cityName: seed.location.cityName,
      category,
      keyword,
      realCount: members.filter((m) => m.source === "real").length,
      seedCount: members.filter((m) => m.source === "seed").length,
      members,
      budgetCeiling: budgets.length ? Math.min(...budgets) : null,
      budgetsGiven: budgets.length,
      currency: seed.currency,
      dateWindow: dateWindow && dateWindow.to >= today ? dateWindow : null,
      center,
      radiusKm,
      areas: [...new Set(members.map((m) => m.location.area).filter(Boolean) as string[])],
      tasteRefs: [...refCounts.values()].sort((a, b) => b.count - a.count).slice(0, 5),
      explanation: parts.join(" · "),
    });
  }
  return clusters.sort((a, b) => b.realCount + b.seedCount - (a.realCount + a.seedCount));
}

/** Does a published event satisfy a wish? Used to attach organizer proposals. */
export function eventFitsWish(w: Wish, e: { cityId: string; category: Category; tags: string[]; title: string; summary: string; venue: { lat: number; lng: number }; sessions: { start: string }[] }, minPrice: number | null) {
  if (w.location.cityId !== e.cityId) return false;
  if (w.category && w.category !== e.category) return false;
  if (straightLineMeters(w.location, e.venue) / 1000 > w.location.radiusKm) return false;
  if (w.budgetMax !== null && minPrice !== null && minPrice > w.budgetMax) return false;
  if (w.from && w.to && !e.sessions.some((s) => s.start.slice(0, 10) >= w.from! && s.start.slice(0, 10) <= w.to!)) return false;
  const hay = `${e.title} ${e.summary} ${e.tags.join(" ")}`.toLowerCase();
  if (w.keywords.length && !w.keywords.some((k) => hay.includes(k.toLowerCase()))) return false;
  return true;
}
