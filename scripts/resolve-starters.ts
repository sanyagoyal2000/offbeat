/**
 * Resolves data/starter-interests.json names to real Qloo entities with /search.
 * Keeps exact name matches only (case, punctuation and "&"/"and" normalised); logs every miss.
 * Usage: npm run qloo:starters
 */
import { readFileSync, writeFileSync } from "node:fs";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
const BASE = (process.env.QLOO_API_URL ?? "https://hackathon.api.qloo.com").replace(/\/$/, "");
const KEY = process.env.QLOO_API_KEY;
const FILE = "data/starter-interests.json";

type Entity = { name: string; entity_id: string; properties?: { image?: { url?: string } } };
type Resolved = { id: string; name: string; type: string; image: string | null; query: string };

const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function search(query: string, type: string): Promise<Entity[]> {
  const res = await fetch(`${BASE}/search?${new URLSearchParams({ query, types: `urn:entity:${type}`, take: "8" })}`, { headers: { "X-Api-Key": KEY! } });
  if (!res.ok) throw new Error(`Qloo /search ${res.status} for "${query}"`);
  return ((await res.json()) as { results?: Entity[] }).results ?? [];
}

async function main() {
  if (!KEY) throw new Error("QLOO_API_KEY is not set (.env.local)");
  const data = JSON.parse(readFileSync(FILE, "utf8")) as { names: Record<string, string[]>; resolved: Record<string, Resolved[]>; misses: unknown[]; resolvedAt: string | null };
  const resolved: Record<string, Resolved[]> = {};
  const misses: { type: string; query: string; candidates: string[] }[] = [];
  for (const [type, names] of Object.entries(data.names)) {
    resolved[type] = [];
    for (const query of names) {
      const hits = await search(query, type);
      const hit = hits.find((e) => norm(e.name) === norm(query));
      if (hit) resolved[type].push({ id: hit.entity_id, name: hit.name, type, image: hit.properties?.image?.url ?? null, query });
      else misses.push({ type, query, candidates: hits.slice(0, 3).map((e) => e.name) });
      console.log(`${hit ? "OK  " : "MISS"} ${type.padEnd(8)} ${query}${hit ? `  →  ${hit.name} ${hit.entity_id}${hit.properties?.image?.url ? "" : " (no image)"}` : `  (top results: ${hits.slice(0, 3).map((e) => e.name).join(" | ") || "none"})`}`);
      await sleep(260); // stay under 4 req/s
    }
  }
  writeFileSync(FILE, `${JSON.stringify({ ...data, resolved, misses, resolvedAt: new Date().toISOString() }, null, 2)}\n`);
  const total = Object.values(resolved).reduce((n, xs) => n + xs.length, 0);
  console.log(`\nResolved ${total} of ${total + misses.length}; ${misses.length} misses logged in ${FILE}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
