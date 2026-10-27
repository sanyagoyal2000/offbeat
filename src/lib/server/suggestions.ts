/**
 * Taste-page suggestions. The page reads interest_suggestions first (instant, works when Qloo is
 * slow); lists older than 24 h are refreshed in the background. "More like this" is live Qloo
 * (cached in qloo_cache). Starter picks come from data/starter-interests.json (resolved Qloo IDs).
 */
import "server-only";
import starterJson from "../../../data/starter-interests.json";
import type { Location } from "@/lib/locations";
import { ENTITY_TABS, GRID, TYPE_LABEL, allocateSlots, composeForYou, composeTab, isIndiaMatch, trendingDiffers, type EntityTab, type Suggestion, type TabKey, type TabSuggestions } from "@/lib/suggestions";
import * as repo from "./db/suggestions";
import { QlooUnavailable, insightsEntities, type QlooEntity } from "./qloo";

export const STALE_MS = 24 * 60 * 60 * 1000;
const TRENDING_TAKE = 8;
/** Cities pre-filled by scripts/refresh-suggestions.ts (every city with sample listings, plus major Indian metros). */
export const MAIN_CITY_IDS = ["bengaluru-in", "mumbai-in", "delhi-in", "chennai-in", "hyderabad-in", "pune-in", "london-gb", "new-york-us"];

const toSuggestion = (e: QlooEntity, type: string): Suggestion => ({ id: e.entity_id, name: e.name, type, image: e.properties?.image?.url ?? null, indiaMatch: isIndiaMatch(e as Parameters<typeof isIndiaMatch>[0]) });

/* ── Refresh (Qloo → table) ── */

export type RefreshReport = Record<string, { popular: number | "failed"; trending: number | "not-supported" | "same-as-popular" | "failed" }>;

const inflight = new Map<string, Promise<RefreshReport>>();

/** Fetches popular (and, where Qloo's trend weighting really changes the list, trending) items for every tab. Old rows stay if a call fails. */
export function refreshCity(loc: Location): Promise<RefreshReport> {
  const running = inflight.get(loc.id);
  if (running) return running;
  const p = (async () => {
    const report: RefreshReport = {};
    const where = { "signal.location.query": loc.name };
    for (const tab of ENTITY_TABS) {
      const type = `urn:entity:${tab}`;
      report[tab] = { popular: "failed", trending: "failed" };
      try {
        const { entities } = await insightsEntities({ "filter.type": type, ...where, "filter.popularity.min": 0.8, take: GRID });
        await repo.replaceRows(loc.id, tab, "popular", entities.map((e) => toSuggestion(e, tab)));
        report[tab].popular = entities.length;
      } catch (e) {
        if (!(e instanceof QlooUnavailable)) throw e;
      }
      try {
        const plain = await insightsEntities({ "filter.type": type, ...where, take: TRENDING_TAKE });
        const trend = await insightsEntities({ "filter.type": type, ...where, "bias.trends": "high", take: TRENDING_TAKE });
        const differs = trendingDiffers(plain.entities.map((e) => e.entity_id), trend.entities.map((e) => e.entity_id));
        // Only show "trending" when Qloo's trend weighting actually changes the list; otherwise it's just popularity.
        const items = differs ? trend.entities.filter((e) => e.properties?.image?.url).map((e) => toSuggestion(e, tab)) : [];
        await repo.replaceRows(loc.id, tab, "trending", items);
        report[tab].trending = differs ? items.length : "same-as-popular";
      } catch (e) {
        if (!(e instanceof QlooUnavailable)) throw e;
        // e.g. books: "urn:entity:book does not yet support trending requests"
        await repo.replaceRows(loc.id, tab, "trending", []);
        report[tab].trending = /400/.test((e as Error).message) ? "not-supported" : "failed";
      }
    }
    return report;
  })().finally(() => inflight.delete(loc.id));
  inflight.set(loc.id, p);
  return p;
}

type StarterFile = { resolved: Record<string, { id: string; name: string; type: string; image: string | null }[]> };

/** Loads the resolved starter list into the table (city "*"). Idempotent. */
export async function loadStarters() {
  const { resolved } = starterJson as unknown as StarterFile;
  for (const tab of ENTITY_TABS) await repo.replaceRows(repo.STARTER_CITY, tab, "starter", (resolved[tab] ?? []).map((s) => ({ ...s, indiaMatch: false })));
}

/* ── Read (table → page) ── */

export type TabView = TabSuggestions & { trending: Suggestion[] };
export type TasteSuggestions = { city: string; tabs: Record<TabKey, TabView>; freshness: "fresh" | "refreshing" | "pending" };

export async function tasteSuggestions(loc: Location, schedule: (task: () => Promise<unknown>) => void): Promise<TasteSuggestions> {
  let rows = await repo.rowsFor(loc.id);
  if (!rows.some((r) => r.source === "starter")) {
    await loadStarters();
    rows = await repo.rowsFor(loc.id);
  }
  const qlooRows = rows.filter((r) => r.source !== "starter");
  const oldest = qlooRows.reduce<string | null>((m, r) => (m === null || r.fetchedAt < m ? r.fetchedAt : m), null);
  const stale = !oldest || Date.now() - Date.parse(oldest) > STALE_MS;
  if (stale) schedule(() => refreshCity(loc).catch((e) => console.error("Suggestion refresh failed", e)));

  const pick = (tab: string, source: repo.Source): Suggestion[] => rows.filter((r) => r.tab === tab && r.source === source).map(({ id, name, type, image, indiaMatch }) => ({ id, name, type, image, indiaMatch }));
  const cityInIndia = loc.countryCode === "IN";
  const byTab = Object.fromEntries(ENTITY_TABS.map((tab) => [tab, { ...composeTab(pick(tab, "popular"), pick(tab, "starter"), { cityInIndia }), trending: pick(tab, "trending").slice(0, TRENDING_TAKE) }])) as Record<EntityTab, TabView>;
  const forYouTrending = ENTITY_TABS.flatMap((tab) => byTab[tab].trending.slice(0, 2)).slice(0, TRENDING_TAKE);
  return {
    city: loc.name,
    tabs: { "for-you": { ...composeForYou(byTab), trending: forYouTrending }, ...byTab },
    freshness: !oldest ? "pending" : stale ? "refreshing" : "fresh",
  };
}

/* ── More like this (live, cached via qloo_cache) ── */

export type Related = Suggestion & { because: string | null };

export async function moreLikeThis(anchors: { id: string; name: string; type: string }[]): Promise<Related[]> {
  if (!anchors.length) return [];
  const ids = anchors.map((a) => a.id).join(",");
  const nameOf = new Map(anchors.map((a) => [a.id, a.name]));
  const slots = allocateSlots(anchors.map((a) => a.type).filter((t) => t in TYPE_LABEL));
  const out: Related[] = [];
  for (const [type, n] of Object.entries(slots)) {
    const { entities } = await insightsEntities({ "filter.type": `urn:entity:${type}`, "signal.interests.entities": ids, "filter.exclude.entities": ids, "feature.explainability": true, take: n + 2 });
    for (const e of entities.filter((x) => !nameOf.has(x.entity_id)).slice(0, n)) {
      const top = [...(e.query?.explainability?.["signal.interests.entities"] ?? [])].sort((a, b) => b.score - a.score).find((x) => nameOf.has(x.entity_id));
      out.push({ ...toSuggestion(e, type), because: top ? nameOf.get(top.entity_id)! : null });
    }
  }
  return out.slice(0, 4);
}
