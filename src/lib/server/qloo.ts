/**
 * Server-side Qloo client.
 *
 * - Caches responses for 24 h (memory + store) keyed by path and parameters.
 * - De-duplicates identical in-flight requests.
 * - Throttles to QLOO_RPS requests/second (default 4; the hackathon key allows 5).
 * - Stops calling once QLOO_MONTHLY_BUDGET calls have been made this month (default 8,000 of 10,000),
 *   so the demo degrades to ordinary browsing instead of failing.
 * Callers must handle QlooUnavailable and fall back honestly.
 */
import "server-only";
import { store } from "./store";

export class QlooUnavailable extends Error {}

const BASE = (process.env.QLOO_API_URL ?? "https://hackathon.api.qloo.com").replace(/\/$/, "");
const KEY = process.env.QLOO_API_KEY;
const RPS = Math.max(1, Number(process.env.QLOO_RPS) || 4);
const MONTHLY_BUDGET = Number(process.env.QLOO_MONTHLY_BUDGET) || 8000;
const TTL_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;

export const qlooConfigured = () => Boolean(KEY);

type CacheEntry = { at: number; body: unknown };
const g = globalThis as unknown as { __qlooMem?: Map<string, CacheEntry>; __qlooInflight?: Map<string, Promise<unknown>>; __qlooNext?: number };
const mem = (g.__qlooMem ??= new Map());
const inflight = (g.__qlooInflight ??= new Map());

/** Space requests at least 1/RPS seconds apart across the process. */
async function throttle() {
  const now = Date.now();
  const slot = Math.max(now, g.__qlooNext ?? 0);
  g.__qlooNext = slot + 1000 / RPS;
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
}

const monthKey = () => `qloo:usage:${new Date().toISOString().slice(0, 7)}`;

export async function qlooUsage() {
  return { used: (await store().get<number>(monthKey())) ?? 0, budget: MONTHLY_BUDGET, rps: RPS, configured: qlooConfigured() };
}

async function countCall() {
  const s = store();
  await s.lock("qloo-usage", async () => s.set(monthKey(), ((await s.get<number>(monthKey())) ?? 0) + 1));
}

export async function qlooGet<T>(path: string, params: Record<string, string | number | boolean | undefined>): Promise<T> {
  if (!KEY) throw new QlooUnavailable("Qloo isn't configured");
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]));
  const qs = new URLSearchParams(Object.entries(clean).sort(([a], [b]) => a.localeCompare(b))).toString();
  const cacheKey = `qloo:${path}?${qs}`;

  const hit = mem.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.body as T;
  const stored = await store().get<CacheEntry>(cacheKey);
  if (stored && Date.now() - stored.at < TTL_MS) {
    mem.set(cacheKey, stored);
    return stored.body as T;
  }
  if (inflight.has(cacheKey)) return inflight.get(cacheKey) as Promise<T>;

  const p = (async () => {
    const { used } = await qlooUsage();
    if (used >= MONTHLY_BUDGET) throw new QlooUnavailable("Monthly Qloo budget reached");
    await throttle();
    await countCall();
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}?${qs}`, { headers: { "X-Api-Key": KEY, accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      throw new QlooUnavailable(`Qloo request failed: ${(e as Error).message}`);
    }
    if (res.status === 429) throw new QlooUnavailable("Qloo rate limit reached");
    if (!res.ok) throw new QlooUnavailable(`Qloo returned ${res.status}`);
    const body = (await res.json()) as T;
    const entry = { at: Date.now(), body };
    mem.set(cacheKey, entry);
    await store().set(cacheKey, entry);
    return body;
  })().finally(() => inflight.delete(cacheKey));
  inflight.set(cacheKey, p);
  return p;
}

/* ── Typed helpers ── */

export type QlooEntity = {
  name: string;
  entity_id: string;
  subtype?: string;
  types?: string[];
  properties?: {
    image?: { url?: string };
    release_year?: number;
    address?: string;
    short_description?: string;
    short_descriptions?: { value?: string; languages?: string[] }[];
    description?: string;
  };
  disambiguation?: string;
  query?: { affinity?: number; explainability?: { "signal.interests.entities"?: { entity_id: string; score: number }[] } };
};
export type QlooTag = { tag_id: string; id?: string; name: string; subtype?: string; query?: { affinity?: number } };

export const ENTITY_TYPES = {
  artist: "urn:entity:artist",
  movie: "urn:entity:movie",
  book: "urn:entity:book",
  place: "urn:entity:place",
  tv_show: "urn:entity:tv_show",
  person: "urn:entity:person",
} as const;

export async function searchEntities(query: string, types: string[], take = 6): Promise<QlooEntity[]> {
  const body = await qlooGet<{ results?: QlooEntity[] }>("/search", { query, types: types.join(","), take });
  return body.results ?? [];
}

export async function insightsEntities(params: Record<string, string | number | boolean | undefined>): Promise<{ entities: QlooEntity[]; raw: unknown }> {
  const body = await qlooGet<{ results?: { entities?: QlooEntity[] } }>("/v2/insights", params);
  return { entities: body.results?.entities ?? [], raw: body };
}

export async function insightsTags(params: Record<string, string | number | boolean | undefined>): Promise<QlooTag[]> {
  const body = await qlooGet<{ results?: { tags?: QlooTag[] } }>("/v2/insights", { "filter.type": "urn:tag", ...params });
  return body.results?.tags ?? [];
}

export async function searchTags(query: string, take = 5): Promise<QlooTag[]> {
  const body = await qlooGet<{ results?: { tags?: QlooTag[] } | QlooTag[] }>("/v2/tags", { "filter.query": query, take });
  const r = body.results;
  return Array.isArray(r) ? r : (r?.tags ?? []);
}

/** A one-line description that helps tell entities apart ("Film, 2013", "Artist", an address). */
export function disambiguate(e: QlooEntity): string {
  const type = (e.subtype ?? e.types?.[0] ?? "").replace("urn:entity:", "").replace("_", " ");
  const label = type ? type[0].toUpperCase() + type.slice(1) : "";
  const year = e.properties?.release_year ? `, ${e.properties.release_year}` : "";
  const desc = e.properties?.short_descriptions?.find((d) => d.languages?.includes("en"))?.value ?? e.properties?.short_description;
  const where = e.properties?.address?.split(",").slice(-3).join(",").trim();
  return [label + year, desc ?? where].filter(Boolean).join(" · ").slice(0, 120);
}
