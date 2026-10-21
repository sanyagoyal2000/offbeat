import { NextResponse } from "next/server";
import { CURRENCY_BY_COUNTRY, searchBuiltInCities, type Location } from "@/lib/locations";
import { citiesWithInventory } from "@/lib/server/catalog";

/**
 * City search: built-in list first (instant, offline), then Open-Meteo's free geocoder for
 * anywhere else. Results say whether Offbeat has any listings there; choosing a city never
 * implies coverage.
 */
const cache = new Map<string, { at: number; results: Location[] }>();
const TTL_MS = 24 * 60 * 60 * 1000;

type GeoResult = { id: number; name: string; latitude: number; longitude: number; country_code?: string; country?: string; admin1?: string; timezone?: string };

async function geocode(q: string): Promise<Location[]> {
  const hit = cache.get(q);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.results;
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`geocoder ${res.status}`);
  const body = (await res.json()) as { results?: GeoResult[] };
  const results = (body.results ?? [])
    .filter((r) => r.country_code && r.timezone)
    .map((r) => ({
      id: `${r.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${r.country_code!.toLowerCase()}-${r.id}`,
      name: r.name,
      region: r.admin1,
      country: r.country ?? r.country_code!,
      countryCode: r.country_code!.toUpperCase(),
      lat: r.latitude,
      lng: r.longitude,
      timezone: r.timezone!,
      currency: CURRENCY_BY_COUNTRY[r.country_code!.toUpperCase()] ?? "USD",
    }));
  cache.set(q, { at: Date.now(), results });
  return results;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const includeRemote = url.searchParams.get("remote") !== "0";
  const builtIn = searchBuiltInCities(q, 8);
  let remote: Location[] = [];
  let remoteError = false;
  if (includeRemote && q.length >= 2) {
    try {
      remote = await geocode(q);
    } catch {
      remoteError = true;
    }
  }
  const seen = new Set(builtIn.map((c) => `${c.name}|${c.countryCode}`));
  const merged = [...builtIn, ...remote.filter((r) => !seen.has(`${r.name}|${r.countryCode}`))].slice(0, 12);
  const covered = await citiesWithInventory();
  return NextResponse.json({
    results: merged.map((l) => ({ ...l, hasEvents: covered.has(l.id) })),
    remoteError,
  });
}
