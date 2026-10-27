/**
 * Taste-page suggestions (pure). Tabs map to Qloo entity types; "For you" mixes all of them.
 * Qloo results and the curated starter list are always kept apart so the page can label them.
 */

export const TABS = [
  { key: "for-you", label: "For you", type: null },
  { key: "artist", label: "Music", type: "artist" },
  { key: "movie", label: "Films", type: "movie" },
  { key: "tv_show", label: "TV shows", type: "tv_show" },
  { key: "book", label: "Books", type: "book" },
  { key: "podcast", label: "Podcasts", type: "podcast" },
  { key: "place", label: "Places & food", type: "place" },
] as const;
export type TabKey = (typeof TABS)[number]["key"];
export type EntityTab = Exclude<TabKey, "for-you">;
export const ENTITY_TABS = TABS.filter((t) => t.type).map((t) => t.key as EntityTab);

export const TYPE_LABEL: Record<string, string> = { artist: "Artist", movie: "Film", tv_show: "TV show", book: "Book", podcast: "Podcast", place: "Place" };

export type Suggestion = { id: string; name: string; type: string; image: string | null; indiaMatch: boolean };
export type TabSuggestions = { popular: Suggestion[]; starters: Suggestion[] };

export const GRID = 12;
const FOR_YOU_PER_TYPE = 2;
/** Mix starters in when Qloo returns fewer than this many items for an Indian city… */
export const MIN_POPULAR = 8;
/** …or when fewer than this share of them are tied to India. */
export const MIN_INDIA_SHARE = 0.5;

/* ── Is a Qloo entity tied to India? (only from Qloo's own metadata) ── */

const INDIAN_WORDS = /\b(india|indian|bollywood|kollywood|tollywood|mollywood|sandalwood|hindi|tamil|telugu|kannada|malayalam|marathi|bengali|punjabi|bhangra|carnatic|hindustani|filmi|desi|mumbai|bengaluru|bangalore|delhi|chennai|kolkata|hyderabad)\b/i;

type QlooLike = { tags?: { name?: string }[]; properties?: Record<string, unknown> };

export function isIndiaMatch(e: QlooLike): boolean {
  const p = e.properties ?? {};
  const countries = ([] as unknown[]).concat(p.release_country ?? [], p.country ?? []).map(String);
  if (countries.some((c) => /^india$/i.test(c))) return true;
  const text = [p.place_of_birth, p.short_description, p.description, p.publisher, p.address, ...(e.tags ?? []).map((t) => t.name)]
    .filter((x) => typeof x === "string")
    .join(" | ");
  return INDIAN_WORDS.test(text);
}

/* ── Composing a tab ── */

/**
 * Qloo's popular list, with curated starters mixed in only for Indian cities when Qloo's list is
 * thin or mostly not tied to India. Never more than GRID items; never duplicates; never items without a Qloo ID.
 */
export function composeTab(popular: Suggestion[], starters: Suggestion[], opts: { cityInIndia: boolean }): TabSuggestions {
  const qloo = popular.filter((s) => s.id).slice(0, GRID);
  const share = qloo.length ? qloo.filter((s) => s.indiaMatch).length / qloo.length : 0;
  const needStarters = opts.cityInIndia && (qloo.length < MIN_POPULAR || share < MIN_INDIA_SHARE);
  if (!needStarters) return { popular: qloo, starters: [] };
  // Keep India-tied Qloo items first, then the rest, leaving room for starters.
  const kept = [...qloo.filter((s) => s.indiaMatch), ...qloo.filter((s) => !s.indiaMatch)].slice(0, Math.max(GRID / 2, qloo.filter((s) => s.indiaMatch).length));
  const seen = new Set(kept.map((s) => s.id));
  const fill = starters.filter((s) => s.id && !seen.has(s.id)).slice(0, GRID - kept.length);
  return { popular: kept, starters: fill };
}

/** "For you": the top items of every type, Qloo first, then starters, up to GRID in total. */
export function composeForYou(byTab: Record<EntityTab, TabSuggestions>): TabSuggestions {
  const popular: Suggestion[] = [];
  const starters: Suggestion[] = [];
  for (const tab of ENTITY_TABS) {
    const t = byTab[tab];
    const fromQloo = t.popular.slice(0, FOR_YOU_PER_TYPE);
    popular.push(...fromQloo);
    starters.push(...t.starters.slice(0, FOR_YOU_PER_TYPE - fromQloo.length));
  }
  return { popular: popular.slice(0, GRID), starters: starters.slice(0, Math.max(0, GRID - popular.length)) };
}

/* ── Trending: only real when trend weighting changes the list ── */

/** True when the trend-weighted list overlaps the plain list by less than `maxOverlap` (Qloo ignores bias.trends for some types). */
export function trendingDiffers(plainIds: string[], trendIds: string[], maxOverlap = 0.75): boolean {
  if (!trendIds.length) return false;
  const plain = new Set(plainIds);
  return trendIds.filter((id) => plain.has(id)).length / trendIds.length < maxOverlap;
}

/* ── More like this: split 4 slots across the picked types ── */

export function allocateSlots(types: string[], slots = 4): Record<string, number> {
  const counts = new Map<string, number>();
  for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, slots);
  const total = ordered.reduce((n, [, c]) => n + c, 0);
  const out: Record<string, number> = Object.fromEntries(ordered.map(([t, c]) => [t, Math.max(1, Math.floor((c / total) * slots))]));
  // Hand out what's left to the most-picked types; trim if the minimum-1 rule overshot.
  let used = Object.values(out).reduce((a, b) => a + b, 0);
  for (let i = 0; used < slots; i = (i + 1) % ordered.length, used++) out[ordered[i][0]]++;
  for (let i = ordered.length - 1; used > slots; i--, used--) out[ordered[i][0]]--;
  return Object.fromEntries(Object.entries(out).filter(([, n]) => n > 0));
}
