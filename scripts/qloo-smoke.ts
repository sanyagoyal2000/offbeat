/**
 * Qloo smoke test: checks the base URL, auth header and parameter names we rely on
 * before building on them. Run with: npm run qloo:smoke
 *
 * Endpoints and params verified against github.com/qloo/docs-public:
 *   - Auth: `X-Api-Key` header (reference/api-onboarding.md)
 *   - Search: GET /search?query=&types= (reference/get-search.md)
 *   - Insights: GET /v2/insights with filter.type, signal.interests.entities,
 *     feature.explainability, filter.location.query, filter.hours (reference/parameters.md,
 *     reference/insights-api-deep-dive.md)
 *   - Tags: GET /v2/tags?filter.query= (reference/get-tags.md)
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const API_KEY = process.env.QLOO_API_KEY;
const BASE = (process.env.QLOO_API_URL ?? "https://hackathon.api.qloo.com").replace(/\/$/, "");

type Json = Record<string, unknown>;

async function call(path: string, params: Record<string, string>) {
  const url = `${BASE}${path}?${new URLSearchParams(params)}`;
  const started = Date.now();
  const res = await fetch(url, { headers: { "X-Api-Key": API_KEY!, accept: "application/json" } });
  const ms = Date.now() - started;
  const text = await res.text();
  let body: Json | null = null;
  try {
    body = JSON.parse(text) as Json;
  } catch {
    /* non-JSON error page */
  }
  const rate = [...res.headers.entries()]
    .filter(([k]) => k.toLowerCase().includes("ratelimit") || k.toLowerCase() === "retry-after")
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  return { url, status: res.status, ms, body, text, rate };
}

let failures = 0;

function header(title: string) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 60 - title.length))}`);
}

function report(r: Awaited<ReturnType<typeof call>>) {
  const ok = r.status >= 200 && r.status < 300;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  HTTP ${r.status}  ${r.ms} ms`);
  console.log(`      ${r.url.replace(BASE, "")}`);
  if (r.rate) console.log(`      rate limit headers: ${r.rate}`);
  if (!ok) console.log(`      body: ${r.text.slice(0, 300)}`);
  return ok;
}

type Entity = {
  name: string;
  entity_id: string;
  subtype?: string;
  types?: string[];
  popularity?: number;
  properties?: { image?: { url?: string }; address?: string };
  tags?: { id: string; name: string }[];
  query?: { affinity?: number; explainability?: unknown };
};

function entitiesOf(body: Json | null): Entity[] {
  if (!body) return [];
  const results = body.results as Json | Entity[] | undefined;
  if (Array.isArray(results)) return results;
  if (results && Array.isArray((results as Json).entities)) return (results as Json).entities as Entity[];
  if (results && Array.isArray((results as Json).tags)) return (results as Json).tags as Entity[];
  return [];
}

async function main() {
  console.log(`Qloo smoke test\nBase URL: ${BASE}\nAuth: X-Api-Key header`);
  if (!API_KEY) {
    console.error("\nQLOO_API_KEY is not set. Add it to .env.local (see .env.example) and rerun.");
    process.exit(1);
  }

  // 1. Resolve anchors: one global artist, one Indian independent act, one film, one Bengaluru place.
  header("1. Search: resolve anchors");
  const anchors: [string, string][] = [
    ["Norah Jones", "urn:entity:artist"],
    ["Prateek Kuhad", "urn:entity:artist"],
    ["The Lunchbox", "urn:entity:movie"],
    ["Toit Indiranagar", "urn:entity:place"],
  ];
  const resolved: Entity[] = [];
  for (const [query, type] of anchors) {
    const r = await call("/search", { query, types: type, take: "3" });
    if (report(r)) {
      const hits = entitiesOf(r.body);
      if (hits.length === 0) console.log(`      "${query}": no match (fallback path would apply)`);
      hits.slice(0, 3).forEach((e, i) =>
        console.log(
          `      ${i === 0 ? "→" : " "} ${e.name}  ${e.entity_id}  ${e.subtype ?? e.types?.join(",") ?? ""}` +
            `${e.properties?.image?.url ? "  [image]" : ""}`,
        ),
      );
      if (hits[0] && type !== "urn:entity:place") resolved.push(hits[0]);
    }
  }
  const ids = resolved.map((e) => e.entity_id).join(",");
  if (!ids) {
    console.log("\nNo anchors resolved; skipping Insights checks.");
    process.exit(1);
  }

  // 2. Taste tags from resolved anchors.
  header("2. Insights: taste tags (filter.type=urn:tag)");
  const tags = await call("/v2/insights", {
    "filter.type": "urn:tag",
    "signal.interests.entities": ids,
    take: "10",
  });
  if (report(tags)) {
    const t = entitiesOf(tags.body);
    console.log(`      ${t.length} tags: ${t.map((x) => x.name).slice(0, 10).join(", ")}`);
  }

  header("2b. Tags search (/v2/tags)");
  const tagSearch = await call("/v2/tags", { "filter.query": "acoustic", take: "5" });
  if (report(tagSearch)) {
    const t = entitiesOf(tagSearch.body) as unknown as { name: string; id: string }[];
    console.log(`      ${t.map((x) => `${x.name} (${x.id})`).join(", ")}`);
  }

  // 3 + 4. Rank artists with explainability.
  header("3. Insights: artists + feature.explainability");
  const artists = await call("/v2/insights", {
    "filter.type": "urn:entity:artist",
    "signal.interests.entities": ids,
    "feature.explainability": "true",
    take: "5",
  });
  if (report(artists)) {
    const a = entitiesOf(artists.body);
    a.forEach((e, i) =>
      console.log(`      #${i + 1} ${e.name}  affinity=${e.query?.affinity?.toFixed?.(3) ?? "?"}`),
    );
    const first = a[0]?.query?.explainability;
    console.log(`      per-result explainability: ${first ? JSON.stringify(first).slice(0, 300) : "MISSING"}`);
    const agg = (artists.body?.query as Json | undefined)?.explainability;
    console.log(`      aggregate explainability: ${agg ? JSON.stringify(agg).slice(0, 300) : "MISSING"}`);
  }

  // 5. Dinner: places in Indiranagar open on Saturday, ranked by the same anchors.
  header("5. Insights: places in Indiranagar, open Saturday");
  const places = await call("/v2/insights", {
    "filter.type": "urn:entity:place",
    "filter.location.query": "Indiranagar, Bengaluru",
    "filter.hours": "saturday",
    "filter.tags": "urn:tag:genre:place:restaurant",
    "signal.interests.entities": ids,
    take: "5",
  });
  if (report(places)) {
    const p = entitiesOf(places.body);
    if (p.length === 0) console.log("      no places returned (sample restaurant list would apply)");
    p.forEach((e, i) =>
      console.log(`      #${i + 1} ${e.name}  ${e.properties?.address ?? ""}  affinity=${e.query?.affinity?.toFixed?.(3) ?? "?"}`),
    );
    const loc = (places.body?.query as Json | undefined)?.locality;
    if (loc) console.log(`      matched locality: ${JSON.stringify(loc).slice(0, 200)}`);
  }

  // 6. Taste-page suggestions, per tab type (reported, not counted as failures: some are optional).
  const TAB_TYPES = ["artist", "movie", "tv_show", "book", "podcast", "place"];
  const optional = async (label: string, path: string, params: Record<string, string>) => {
    const r = await call(path, params);
    const list = entitiesOf(r.body);
    const ok = r.status >= 200 && r.status < 300 && list.length > 0;
    console.log(`${ok ? "OK  " : "NONE"}  HTTP ${r.status}  ${r.ms} ms  ${label}: ${list.length} results`);
    console.log(`      ${r.url.replace(BASE, "")}`);
    if (list.length) console.log(`      ${list.slice(0, 8).map((e) => `${e.name}${e.properties?.image?.url ? "" : " (no image)"}${e.popularity !== undefined ? ` p=${Number(e.popularity).toFixed(2)}` : ""}`).join(" · ")}`);
    else console.log(`      body: ${r.text.slice(0, 200)}`);
    return list;
  };

  header("6a. Popular in city: signal.location.query + filter.popularity.min");
  for (const t of TAB_TYPES) {
    await optional(`${t} in Bengaluru`, "/v2/insights", { "filter.type": `urn:entity:${t}`, "signal.location.query": "Bengaluru", "filter.popularity.min": "0.8", take: "12" });
  }
  await optional("artist in Bengaluru, no popularity filter", "/v2/insights", { "filter.type": "urn:entity:artist", "signal.location.query": "Bengaluru", take: "12" });

  header("6b. Trending: /v2/trending (needs signal + dates)");
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  for (const t of ["artist", "movie", "tv_show"]) {
    await optional(`trending ${t}`, "/v2/trending", { "filter.type": `urn:entity:${t}`, "signal.interests.entities": ids, "filter.start_date": start, "filter.end_date": end, take: "8" });
  }

  header("6c. Trending fallback: /v2/insights bias.trends=high");
  for (const t of TAB_TYPES) {
    await optional(`${t} bias.trends=high`, "/v2/insights", { "filter.type": `urn:entity:${t}`, "signal.location.query": "Bengaluru", "bias.trends": "high", take: "8" });
  }

  header("6d. More like this: signal.interests.entities + explainability + exclude");
  for (const t of ["artist", "movie", "tv_show", "book"]) {
    const list = await optional(`more ${t}`, "/v2/insights", { "filter.type": `urn:entity:${t}`, "signal.interests.entities": ids, "filter.exclude.entities": ids, "feature.explainability": "true", take: "4" });
    const ex = list[0]?.query?.explainability;
    if (ex) console.log(`      explainability[0]: ${JSON.stringify(ex).slice(0, 200)}`);
  }

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
