import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { Poster } from "@/components/Poster";
import { formatClock, formatDay, formatMoney } from "@/lib/tz";
import { exploreLocation } from "@/lib/server/identity";
import { FILMS, filmsInCity } from "@/lib/server/movies";

export default async function FilmPage({ params, searchParams }: { params: Promise<{ filmId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { filmId } = await params;
  const sp = await searchParams;
  const film = FILMS[filmId];
  if (!film) notFound();
  const loc = await exploreLocation();
  const listing = (await filmsInCity(loc.id)).find((f) => f.film.id === filmId);
  const days = listing ? [...new Set(listing.cinemas.flatMap((c) => c.showtimes.map((s) => s.start.slice(0, 10))))].sort().slice(0, 14) : [];
  const day = sp.date && days.includes(sp.date) ? sp.date : days[0];

  return (
    <main className="mx-auto max-w-5xl px-4 pt-4 sm:px-6">
      <BackLink href="/movies" label="All movies" />
      <div className="grid gap-6 sm:grid-cols-[200px_1fr]">
        <div className="max-w-[200px]"><Poster title={film.title} year={film.year} image={film.image} priority /></div>
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-citron">Movies · {film.language}</p>
          <h1 className="font-display text-[26px] leading-tight">{film.title}</h1>
          <p className="text-[14px] text-muted">{film.year} · {film.genres.join(", ")}{film.qlooName && film.qlooName !== film.title ? ` · also known as ${film.qlooName}` : ""}</p>
          {film.description && <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-ivory/85">{film.description}</p>}
          <p className="mt-2 text-[12px] text-muted">Film details and poster via Qloo. Showtimes and cinemas are fictional samples.</p>
        </div>
      </div>

      <section className="mt-6" aria-labelledby="st-h">
        <h2 id="st-h" className="text-[16px] font-bold">Showtimes in {loc.name}</h2>
        {!listing ? (
          <p className="mt-2 text-[14px] text-muted">Not showing in {loc.name}. Switch city or <Link href={`/wishes/new?cat=Movies&kw=${encodeURIComponent(film.title.toLowerCase())}`} className="font-semibold text-citron">wish for a screening</Link>.</p>
        ) : (
          <>
            <nav aria-label="Dates" className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
              {days.map((d) => (
                <Link key={d} href={`/movies/${filmId}?date=${d}`} scroll={false} aria-current={d === day ? "date" : undefined} className={`flex h-14 w-16 flex-none flex-col items-center justify-center rounded-[14px] text-[12px] font-semibold ${d === day ? "bg-citron text-ink" : "border border-ivory/20"}`}>
                  {formatDay(`${d}T12:00`).split(" ").map((p, i) => <span key={i} className={i === 1 ? "text-[16px] font-bold" : ""}>{p}</span>)}
                </Link>
              ))}
            </nav>
            <ul className="mt-4 flex flex-col gap-3">
              {listing.cinemas.map(({ event, showtimes }) => {
                const today = showtimes.filter((s) => s.start.startsWith(day));
                return (
                  <li key={event.id} className="rounded-[20px] border border-line bg-card p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link href={`/events/${event.id}?back=/movies/${filmId}`} className="font-semibold hover:text-citron">{event.venue.name}</Link>
                      <span className="text-[12px] text-muted">{event.venue.area} · {event.movie?.subtitles ? `${event.movie.subtitles} subtitles` : event.movie?.language}</span>
                    </div>
                    {today.length === 0 ? (
                      <p className="mt-2 text-[13px] text-muted">No shows on this date.</p>
                    ) : (
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {today.map((s) => {
                          const sold = s.left === 0;
                          const few = !sold && s.left / s.capacity < 0.1;
                          return (
                            <li key={s.sessionId}>
                              {sold ? (
                                <span className="tnum flex h-11 items-center rounded-full border border-ivory/10 px-4 text-[14px] text-muted line-through" aria-label={`${formatClock(s.start)}, sold out`}>{formatClock(s.start)}</span>
                              ) : (
                                <>
                                <Link href={`/events/${event.id}/book?session=${s.sessionId}`} className={`tnum flex h-11 items-center rounded-full border px-4 text-[14px] font-semibold hover:border-citron ${few ? "border-citron/70 text-citron" : "border-ivory/30"}`} aria-label={`${formatClock(s.start)}, ${s.left} seats left, from ${formatMoney(s.total, listing.currency)} including demo fees`}>
                                  <span>{formatClock(s.start)}<span className="block text-[11px] font-normal">From {formatMoney(s.total, listing.currency)} incl. fees</span></span>
                                </Link>
                                <span className="mt-1 block max-w-44 text-[10px] text-muted">{formatMoney(s.fromPrice, listing.currency)} ticket + {formatMoney(s.fee, listing.currency)} demo fee</span>
                                </>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[12px] text-muted">Highlighted times have fewer than 10% of seats left.</p>
          </>
        )}
      </section>
    </main>
  );
}
