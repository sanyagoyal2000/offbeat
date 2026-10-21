/** Wish storage, seeded demo wishes, and organizer proposals. */
import "server-only";
import { cityById } from "@/lib/locations";
import type { Category } from "@/lib/categories";
import { eventFitsWish, type Wish, type WishInput } from "@/lib/wishes";
import type { OfferEvent } from "@/lib/events";
import { addNotification } from "./notifications";
import { getDoc, listDocs, newId, putDoc, store } from "./store";

const userIdx = (uid: string) => `user:${uid}:wishes`;

export async function createWish(uid: string, input: WishInput): Promise<Wish> {
  const now = new Date().toISOString();
  const w: Wish = { ...input, id: newId("wish"), uid, source: "real", status: "open", createdAt: now, updatedAt: now, proposals: [] };
  await putDoc("wishes", w);
  await store().sadd(userIdx(uid), w.id);
  return w;
}

export async function updateWish(uid: string, id: string, patch: Partial<WishInput> & { status?: "open" | "withdrawn" }): Promise<Wish | null> {
  return store().lock(`wish:${id}`, async () => {
    const w = await getDoc<Wish>("wishes", id);
    if (!w || w.uid !== uid) return null;
    const next: Wish = { ...w, ...patch, status: patch.status === "withdrawn" ? "withdrawn" : patch.status === "open" ? (w.proposals.length ? "proposed" : "open") : w.status, updatedAt: new Date().toISOString() };
    await putDoc("wishes", next);
    return next;
  });
}

export async function getWish(id: string) {
  return (await getDoc<Wish>("wishes", id)) ?? SEED_WISHES.find((w) => w.id === id) ?? null;
}

export async function myWishes(uid: string): Promise<Wish[]> {
  const ids = await store().smembers(userIdx(uid));
  return (await store().mget<Wish>(ids.map((i) => `wishes:${i}`))).filter((w): w is Wish => !!w).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const realWishes = () => listDocs<Wish>("wishes");
export async function allWishes(): Promise<Wish[]> {
  return [...SEED_WISHES, ...(await realWishes())];
}

/** When an organizer publishes an event proposed for demand, attach it to every fitting open wish. */
export async function attachProposal(event: OfferEvent, minPrice: number | null) {
  let matched = 0;
  for (const w of await realWishes()) {
    if (w.status === "withdrawn" || !w.notify || w.proposals.some((p) => p.eventId === event.id)) continue;
    if (!eventFitsWish(w, event, minPrice)) continue;
    await store().lock(`wish:${w.id}`, async () => {
      const fresh = (await getDoc<Wish>("wishes", w.id))!;
      fresh.proposals.push({ eventId: event.id, organizerId: event.organizerId, at: new Date().toISOString() });
      fresh.status = "proposed";
      fresh.updatedAt = new Date().toISOString();
      await putDoc("wishes", fresh);
    });
    await addNotification(w.uid, { kind: "proposal", title: `An organizer proposed “${event.title}”`, body: "It matches one of your wishes. Check the details and reserve if it suits you.", href: `/events/${event.id}` });
    matched++;
  }
  // Seeded wishes are counted for context only; they never receive notifications.
  const seedMatches = SEED_WISHES.filter((w) => eventFitsWish(w, event, minPrice)).length;
  return { matched, seedMatches };
}

/* ── Seeded demo wishes (labelled "sample" everywhere) ── */

function seed(n: number, base: { cityId: string; category: Category | null; keywords: string[]; area: string; lat: number; lng: number; budget: number | null; currency: string; from?: string; to?: string; refs?: { id: string; name: string }[] }): Wish[] {
  const city = cityById(base.cityId)!;
  return Array.from({ length: n }, (_, i) => {
    const jitter = ((i * 37) % 11) / 1000;
    // Sample wishes are dated within the last ~10 days so 30-day demand windows keep showing them.
    const created = new Date(Date.now() - (i + 1) * 36e5 * 13).toISOString();
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

export const SEED_WISHES: Wish[] = [
  ...seed(18, { cityId: "bengaluru-in", category: "Music", keywords: ["acoustic"], area: "Indiranagar", lat: 12.9719, lng: 77.6412, budget: 1500, currency: "INR", from: "2026-10-24", to: "2026-12-20", refs: [PK, LTR] }),
  ...seed(11, { cityId: "bengaluru-in", category: "Workshops & classes", keywords: ["pottery"], area: "HSR Layout", lat: 12.9116, lng: 77.6474, budget: 2000, currency: "INR" }),
  ...seed(6, { cityId: "bengaluru-in", category: "Treks & outdoors", keywords: ["sunrise"], area: "Hebbal", lat: 13.0358, lng: 77.597, budget: 2500, currency: "INR" }),
  ...seed(7, { cityId: "london-gb", category: "Music", keywords: ["folk"], area: "Hackney", lat: 51.545, lng: -0.0553, budget: 20, currency: "GBP", refs: [LM] }),
  ...seed(5, { cityId: "new-york-us", category: "Movies", keywords: ["screening"], area: "Greenpoint, Brooklyn", lat: 40.7304, lng: -73.9542, budget: 20, currency: "USD" }),
];
