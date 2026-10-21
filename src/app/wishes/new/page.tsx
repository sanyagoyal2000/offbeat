import { cityById } from "@/lib/locations";
import { parseRangeParams } from "@/lib/dateRange";
import { CATEGORIES, type Category } from "@/lib/categories";
import { publishedEvents } from "@/lib/server/catalog";
import { currentUid, exploreLocation } from "@/lib/server/identity";
import { getTaste } from "@/lib/server/taste";
import { centroid } from "@/lib/geo";
import { WishForm } from "./WishForm";

export default async function NewWishPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const loc = (sp.city && cityById(sp.city)) || (await exploreLocation());
  const events = await publishedEvents(loc.id);
  const areas = [...new Set(events.map((e) => e.venue.area))].sort().map((name) => ({ name, ...centroid(events.filter((e) => e.venue.area === name).map((e) => e.venue))! }));
  const taste = await getTaste(await currentUid());
  const range = parseRangeParams(sp.from, sp.to);
  return (
    <main className="mx-auto max-w-2xl px-4 pt-6 sm:px-6">
      <h1 className="font-display text-[24px]">Make a wish</h1>
      <p className="mt-1 text-[14px] text-ivory/75">Describe the event you wish existed. You&apos;ll check every detail before it&apos;s saved.</p>
      <WishForm
        location={loc}
        areas={areas}
        interests={taste.interests.map((i) => ({ id: i.id, name: i.name }))}
        prefill={{
          category: CATEGORIES.includes(sp.cat as Category) ? (sp.cat as Category) : null,
          keywords: (sp.kw ?? "").split(/\s+/).filter(Boolean),
          from: range?.from ?? null,
          to: range?.to ?? null,
          budgetMax: sp.max ? Number(sp.max) : null,
          area: sp.near ?? null,
        }}
      />
    </main>
  );
}
