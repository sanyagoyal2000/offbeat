import Link from "next/link";
import { Poster } from "@/components/Poster";
import { formatDayTime, formatMoney } from "@/lib/tz";
import { exploreLocation } from "@/lib/server/identity";
import { filmsInCity } from "@/lib/server/movies";

export default async function MoviesPage() {
  const loc = await exploreLocation();
  const films = await filmsInCity(loc.id);
  return (
    <main className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
      <h1 className="font-display text-[24px]">Movies in {loc.name}</h1>
      <p className="mt-1 max-w-2xl text-[13px] text-muted">
        Released films at fictional sample cinemas with made-up showtimes. Film details and posters come from Qloo. Pick a showtime, then choose your seats.
      </p>
      {films.length === 0 ? (
        <div className="mt-6 rounded-[24px] border border-dashed border-ivory/20 p-6 text-center">
          <p>No screenings in {loc.name} yet.</p>
          <Link href={`/wishes/new?cat=Movies&city=${loc.id}`} className="mt-3 inline-flex h-11 items-center rounded-full bg-citron px-5 font-bold text-ink">Wish for a screening</Link>
        </div>
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {films.map((f, i) => {
            const cheapest = f.cinemas.flatMap((c) => c.showtimes).filter((s) => s.left > 0).sort((a, b) => a.total - b.total)[0];
            return (
            <li key={f.film.id}>
              <Link href={`/movies/${f.film.id}`} className="group block">
                <Poster title={f.film.title} year={f.film.year} image={f.film.image} priority={i < 5} sizes="(min-width: 1024px) 20vw, 50vw" />
                <p className="mt-2 font-display text-[14px] leading-snug group-hover:text-citron">{f.film.title}</p>
                <p className="text-[12px] text-muted">{f.film.language} · {f.film.year} · {f.film.genres.slice(0, 2).join(", ")}</p>
                <p className="tnum text-[12px] text-ivory/80">Next: {f.nextStart ? formatDayTime(f.nextStart) : "–"}</p>
                {cheapest ? <p className="tnum mt-1 text-[14px] font-bold">From {formatMoney(cheapest.total, f.currency)}<span className="block text-[11px] font-normal text-muted">{formatMoney(cheapest.fromPrice, f.currency)} ticket + {formatMoney(cheapest.fee, f.currency)} demo fee</span></p> : <p className="text-[12px] text-muted">Sold out</p>}
                <p className="text-[12px] text-muted">{f.cinemas.length} cinema{f.cinemas.length === 1 ? "" : "s"}</p>
              </Link>
            </li>
          );})}
        </ul>
      )}
      <p className="mt-6 text-[11px] text-muted">Posters: Qloo.</p>
    </main>
  );
}
