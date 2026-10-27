/**
 * Sample wishes (seed input only, loaded by scripts/seed.ts with is_sample = 1).
 * They're dated relative to the seed run so the 30-day demand window shows them.
 */
import { cityById } from "./locations";
import type { Category } from "./categories";
import type { Wish } from "./wishes";

function seed(n: number, now: number, base: { cityId: string; category: Category | null; keywords: string[]; area: string; lat: number; lng: number; budget: number | null; currency: string; from?: string; to?: string; refs?: { id: string; name: string }[] }): Wish[] {
  const city = cityById(base.cityId)!;
  return Array.from({ length: n }, (_, i) => {
    const jitter = ((i * 37) % 11) / 1000;
    // Sample wishes are dated within the last ~10 days so 30-day demand windows keep showing them.
    const created = new Date(now - (i + 1) * 36e5 * 13).toISOString();
    return {
      id: `seed_${base.cityId}_${base.keywords[0] ?? base.category}_${i}`.replace(/[^a-z0-9_-]/gi, ""),
      uid: "seed",
      source: "seed" as const,
      status: "open" as const,
      createdAt: created,
      updatedAt: created,
      text: "",
      category: base.category,
      keywords: base.keywords,
      from: base.from ?? null,
      to: base.to ?? null,
      budgetMax: base.budget === null ? null : base.budget + (i % 3) * (base.currency === "INR" ? 200 : 5),
      currency: base.currency,
      location: { cityId: base.cityId, cityName: city.name, area: base.area, lat: base.lat + jitter, lng: base.lng - jitter, radiusKm: 5 },
      tasteRefs: base.refs && i % 2 === 0 ? base.refs : [],
      notify: true,
      proposals: [],
    };
  });
}

const PK = { id: "871AE4FF-0D03-45CE-A6E1-B255607FA3DD", name: "Prateek Kuhad" };
const LTR = { id: "708E858B-D0E9-4606-A64B-47B890D46108", name: "The Local Train" };
const LM = { id: "4332F867-78AF-4B9E-B930-02D8D9A30755", name: "Laura Marling" };

export const sampleWishes = (now = Date.now()): Wish[] => [
  ...seed(18, now, { cityId: "bengaluru-in", category: "Music", keywords: ["acoustic"], area: "Indiranagar", lat: 12.9719, lng: 77.6412, budget: 1500, currency: "INR", from: "2026-10-24", to: "2026-12-20", refs: [PK, LTR] }),
  ...seed(11, now, { cityId: "bengaluru-in", category: "Workshops & classes", keywords: ["pottery"], area: "HSR Layout", lat: 12.9116, lng: 77.6474, budget: 2000, currency: "INR" }),
  ...seed(6, now, { cityId: "bengaluru-in", category: "Treks & outdoors", keywords: ["sunrise"], area: "Hebbal", lat: 13.0358, lng: 77.597, budget: 2500, currency: "INR" }),
  ...seed(7, now, { cityId: "london-gb", category: "Music", keywords: ["folk"], area: "Hackney", lat: 51.545, lng: -0.0553, budget: 20, currency: "GBP", refs: [LM] }),
  ...seed(5, now, { cityId: "new-york-us", category: "Movies", keywords: ["screening"], area: "Greenpoint, Brooklyn", lat: 40.7304, lng: -73.9542, budget: 20, currency: "USD" }),
];
