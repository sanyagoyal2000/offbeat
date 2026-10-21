import Link from "next/link";
import { ArrowRightIcon, SparklesIcon, UsersIcon, StarIcon } from "@/components/icons";
import { EventCard } from "@/components/EventCard";
import { HomeFilters } from "@/components/home/HomeFilters";
import { SaveSearchButton } from "@/components/home/SaveSearchButton";
import { PromoSlot } from "@/components/promo/PromoSlot";
import { CITIES, locationLabel } from "@/lib/locations";
import { DROP_COPY, type DropReason } from "@/lib/discovery";
import { formatRange } from "@/lib/dateRange";
import { formatMoney } from "@/lib/tz";
import { browse, budgetPresets, readBrowseParams } from "@/lib/server/browse";
import { citiesWithInventory } from "@/lib/server/catalog";
import { currentUid, exploreLocation } from "@/lib/server/identity";
import { savedIds } from "@/lib/server/saved";
import { getTaste } from "@/lib/server/taste";
import { pickPromo } from "@/lib/server/experiments";
import { filmsInCity } from "@/lib/server/movies";
import { Poster } from "@/components/Poster";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const [uid, loc] = await Promise.all([currentUid(), exploreLocation()]);
  const taste = await getTaste(uid);
  const params = readBrowseParams(sp, taste.interests.length > 0);
  const [result, saved, covered] = await Promise.all([browse(loc, params, uid), savedIds(uid), citiesWithInventory()]);
  const currency = result.offers[0]?.event.currency ?? loc.currency;
  const query = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))).toString();
  const returnTo = `/${query ? `?${query}` : ""}`;
  const hasFilters = !!(params.kw.length || params.category || params.range || params.tonight || params.time !== "any" || params.max !== null || params.party > 1 || params.near);
  const promo = result.totalInCity > 0 ? await pickPromo(uid, loc.id, taste.interests) : null;
  const films = hasFilters ? [] : (await filmsInCity(loc.id)).slice(0, 8);
  // Films have their own rail and page; keep the main grid for other experiences unless asked.
  const showFilmsInGrid = !!(params.category === "Movies" || params.kw.length || films.length === 0);
  const gridOffers = showFilmsInGrid ? result.offers : result.offers.filter((o) => o.event.category !== "Movies");

  const describe = [
    params.kw.length && `“${params.kw.join(" ")}”`,
    params.category,
    params.tonight ? "tonight" : params.range && formatRange(params.range),
    params.max !== null && `up to ${formatMoney(params.max, currency)}`,
    params.party > 1 && `${params.party} people`,
    params.near && `near ${params.near}`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pt-6 sm:px-6">
      <section className="flex flex-col gap-2">
        <h1 className="font-display text-[24px] leading-tight sm:text-[30px]">Things to do in {loc.name}</h1>
        <p className="max-w-2xl text-[14px] text-ivory/75">
          Find experiences that fit your taste, wherever you are, and help organizers discover demand for their next event.
        </p>
      </section>

      <section aria-label="Make it your kind of outing" className="grid gap-3 sm:grid-cols-3">
        <Link href="/friends" className="group flex items-center gap-4 rounded-[22px] border border-citron/40 bg-citron/10 p-4 sm:col-span-1 sm:flex-col sm:items-start">
          <span className="flex size-11 flex-none items-center justify-center rounded-full bg-citron text-ink"><UsersIcon size={24} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-bold">Plan with friends</span>
            <span className="mt-1 block text-[13px] leading-relaxed text-ivory/75">Pick a few events. Invite friends. Vote on a plan.</span>
          </span>
          <ArrowRightIcon size={19} className="flex-none text-citron sm:self-end" />
        </Link>
        <Link href={taste.interests.length ? `/?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(query)), sort: "relevance" }).toString()}#events` : "/taste"} className="group flex items-center gap-4 rounded-[22px] border border-line bg-card p-4 hover:border-ivory/30 sm:flex-col sm:items-start">
          <SparklesIcon size={23} className="flex-none text-citron" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold">Personal picks</span>
            <span className="mt-1 block text-[13px] leading-relaxed text-ivory/75">{taste.interests.length ? "See events connected to your interests." : "Start with an artist, film or book you love."}</span>
          </span>
          <ArrowRightIcon size={18} className="flex-none text-muted sm:self-end" />
        </Link>
        <Link href={`/wishes/new?${query}`} className="group flex items-center gap-4 rounded-[22px] border border-line bg-card p-4 hover:border-ivory/30 sm:flex-col sm:items-start">
          <StarIcon size={23} className="flex-none text-citron" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold">Wish it into an event</span>
            <span className="mt-1 block text-[13px] leading-relaxed text-ivory/75">Tell organizers what you want. Review their proposals.</span>
          </span>
          <ArrowRightIcon size={18} className="flex-none text-muted sm:self-end" />
        </Link>
      </section>

      <HomeFilters
        state={{ ...params, category: params.category ?? null }}
        today={result.today}
        currency={currency}
        budgetPresets={budgetPresets(currency)}
        hasInterests={taste.interests.length > 0}
        calendarIndex={result.calendarIndex}
      />

      {result.totalInCity > 0 && params.sort === "relevance" && (
        <p className="-mt-2 text-[13px] text-muted" role="status">
          {taste.interests.length === 0 ? (
            <>
              Showing soonest first.{" "}
              <Link href="/taste" className="font-semibold text-citron underline-offset-4 hover:underline">
                Add interests
              </Link>{" "}
              to order by taste (optional).
            </>
          ) : result.taste.status === "ranked" ? (
            <>Ordered by how closely each event connects to your interests (via Qloo), within your filters. Events without taste data follow by date.</>
          ) : (
            result.taste.message
          )}
        </p>
      )}

      {promo && <PromoSlot promo={promo} />}

      {films.length > 0 && (
        <section aria-labelledby="now-h">
          <div className="flex items-baseline justify-between">
            <h2 id="now-h" className="font-display text-[17px]">Now showing</h2>
            <Link href="/movies" className="text-[13px] font-semibold text-citron">All movies</Link>
          </div>
          <ul className="no-scrollbar -mx-4 mt-3 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            {films.map((f) => (
              <li key={f.film.id} className="w-28 flex-none sm:w-32">
                <Link href={`/movies/${f.film.id}`} className="group block">
                  <Poster title={f.film.title} year={f.film.year} image={f.film.image} sizes="128px" />
                  <p className="mt-1.5 line-clamp-2 text-[13px] font-semibold leading-snug group-hover:text-citron">{f.film.title}</p>
                  <p className="text-[11px] text-muted">{f.film.language}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.totalInCity === 0 ? (
        <section className="rounded-[24px] border border-dashed border-ivory/20 p-6 text-center sm:p-10">
          <h2 className="font-display text-[18px]">No listings in {loc.name} yet</h2>
          <p className="mx-auto mt-2 max-w-md text-[14px] text-ivory/75">
            Offbeat doesn&apos;t have events here. You can save this search, make a wish so organizers see the demand, or pick a city that has sample listings.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <SaveSearchButton label={`Anything in ${loc.name}`} query={query} cityId={loc.id} cityName={loc.name} />
            <Link href={`/wishes/new?city=${loc.id}`} className="flex h-11 items-center rounded-full bg-citron px-5 text-[14px] font-bold text-ink">
              Make a wish
            </Link>
          </div>
          <p className="mt-5 text-[13px] text-muted">
            Cities with sample listings:{" "}
            {CITIES.filter((c) => covered.has(c.id))
              .map((c) => locationLabel(c))
              .join(" · ")}
            . Use the location button at the top to switch.
          </p>
        </section>
      ) : result.offers.length === 0 ? (
        <section className="rounded-[24px] border border-dashed border-ivory/20 p-6 sm:p-8" aria-live="polite">
          <h2 className="font-display text-[18px]">Nothing matches {describe || "these filters"}</h2>
          <p className="mt-2 text-[14px] text-ivory/75">Here&apos;s what ruled events out. Remove or edit a filter above, or tell organizers what you&apos;re looking for.</p>
          <ul className="mt-3 flex flex-col gap-1 text-[14px]">
            {(Object.entries(result.dropped) as [DropReason, number][])
              .filter(([r]) => r !== "area" || params.near)
              .sort((a, b) => b[1] - a[1])
              .map(([r, n]) => (
                <li key={r}>
                  <span className="tnum font-semibold">{n}</span> {n === 1 ? "event" : "events"}: {DROP_COPY[r]}
                </li>
              ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/wishes/new?${query}`} className="flex h-11 items-center rounded-full bg-citron px-5 text-[14px] font-bold text-ink">
              Wish for this
            </Link>
            <SaveSearchButton label={describe || `Events in ${loc.name}`} query={query} cityId={loc.id} cityName={loc.name} />
          </div>
        </section>
      ) : (
        <section id="events" className="scroll-mt-24" aria-label="Events">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-[18px]">{params.sort === "relevance" && result.taste.status === "ranked" ? "Your personal picks" : "Explore events"}</h2>
            <Link href="/wishes" className="inline-flex min-h-11 items-center text-[13px] font-semibold text-citron">My requests & proposals</Link>
          </div>
          <p className="mb-3 text-[13px] text-muted" role="status">
            {gridOffers.length} {gridOffers.length === 1 ? "event" : "events"}
            {hasFilters ? ` match ${describe}` : ""}
            {!showFilmsInGrid && result.offers.length > gridOffers.length ? " (films are under Now showing)" : ""} · times shown in local time ({loc.timezone})
          </p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {gridOffers.map((o, i) => (
              <li key={o.event.id}>
                <EventCard offer={o} saved={saved.has(o.event.id)} reason={result.taste.reasons.get(o.event.id)?.text} priority={i < 3} returnTo={returnTo} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
