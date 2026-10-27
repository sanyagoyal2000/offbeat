import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { BackLink } from "@/components/BackLink";
import { AvailabilityBadge } from "@/components/EventCard";
import { TicketPrice } from "@/components/TicketPrice";
import { SaveButton } from "@/components/SaveButton";
import { ShareButton } from "@/components/ShareButton";
import { AddToBoard } from "@/components/boards/AddToBoard";
import { listBoards } from "@/lib/server/boards";
import { cheapestTier, factLabels, remaining, sessionAvailability } from "@/lib/events";
import { bookingFee, feeLabel } from "@/lib/pricing";
import { addMinutesLocal, formatClock, formatDay, formatLongDay, nowIn, zoneLabel } from "@/lib/tz";
import { cityById } from "@/lib/locations";
import { creditFor } from "@/lib/photoCredits";
import { track } from "@/lib/server/analytics";
import { feeRuleFor, getEvent, getOrganizer, soldMaps } from "@/lib/server/catalog";
import { currentUser } from "@/lib/server/identity";
import { savedIds } from "@/lib/server/saved";
import { getTaste, mappingsFor, rankByTaste } from "@/lib/server/taste";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[24px] border border-line bg-card p-5">
      <h2 className="text-[15px] font-bold text-citron">{title}</h2>
      <div className="mt-2 text-[14px] leading-relaxed text-ivory/85">{children}</div>
    </section>
  );
}

function Facts({ rows }: { rows: [string, ReactNode | undefined][] }) {
  const shown = rows.filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (!shown.length) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
      {shown.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const List = ({ items }: { items?: string[] }) =>
  items?.length ? (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  ) : null;

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const event = await getEvent(id);
  if (!event || event.status === "archived") notFound();
  const { uid, account } = await currentUser();
  const [organizer, sold, saved, taste, boards] = await Promise.all([getOrganizer(event.organizerId), soldMaps([event]), savedIds(uid), getTaste(uid), account ? listBoards(uid) : []]);
  const isDraft = event.status === "draft";
  if (!isDraft) await track({ kind: "view", eventId: event.id, uid, source: "real" });

  const now = nowIn(event.timezone);
  const upcoming = event.sessions.filter((s) => s.start > now && !s.cancelled);
  const session = upcoming.find((s) => s.id === sp.session) ?? upcoming.find((s) => cheapestTier(s, sold[s.id] ?? {})) ?? upcoming[0];
  const rule = feeRuleFor(event.cityId);
  const selectedTier = session ? cheapestTier(session, sold[session.id] ?? {}) : null;
  const city = cityById(event.cityId);
  const back = sp.back && sp.back.startsWith("/") ? sp.back : "/";
  const ranking = taste.interests.length ? await rankByTaste(taste.interests, [event]) : null;
  const reason = ranking?.reasons.get(event.id);
  const mappings = mappingsFor(event);
  const facts = factLabels(event);
  const photo = creditFor(event.image);

  return (
    <main className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
      <BackLink href={back} label={back === "/" ? "Explore" : "Back to results"} />
      {isDraft && <p className="mb-3 rounded-[16px] border border-dashed border-citron/50 p-3 text-[13px] text-citron">Draft preview: only you can see this. Publish it from the organizer workspace.</p>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-4">
          <div className="relative aspect-[16/9] overflow-hidden rounded-[26px] border border-line">
            <Image src={event.image} alt={photo?.alt ?? ""} fill priority sizes="(min-width: 1024px) 700px, 100vw" className={event.film ? "object-cover object-top" : "object-cover"} />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-transparent to-transparent" />
            {event.source === "sample" && <span className="absolute left-4 top-4 rounded-full bg-ink/75 px-3 py-1 text-[12px] font-semibold">Sample listing · fictional</span>}
          </div>
          {photo ? (
            <p className="-mt-2 text-[11px] text-muted">
              Illustrative photo:{" "}
              <a href={photo.source} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-ivory">{photo.author}</a>
              {", "}
              {photo.licenseUrl ? <a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-ivory">{photo.license}</a> : photo.license}
              , via Wikimedia Commons. Not taken at this event.
            </p>
          ) : event.film?.imageCredit ? (
            <p className="-mt-2 text-[11px] text-muted">Poster via Qloo.</p>
          ) : null}
          <header>
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-citron">{event.category}</p>
            <h1 className="mt-1 font-display text-[24px] leading-tight sm:text-[30px]">{event.title}</h1>
            <p className="mt-1 text-[15px] text-ivory/80">{event.summary}</p>
            <p className="mt-1 text-[14px] text-muted">
              {event.venue.name} · {event.venue.area}
              {city ? `, ${city.name}` : ""} · {Math.round(event.durationMin / 60 * 10) / 10} h
            </p>
            {facts.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="Key facts">
                {facts.map((f) => (
                  <li key={f} className="rounded-full border border-ivory/20 px-3 py-1 text-[12px] font-semibold">
                    {f}
                  </li>
                ))}
              </ul>
            )}
            <section aria-label="Selected date and price" className="mt-4 rounded-[20px] border border-citron/25 bg-card p-4">
              {session ? (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Selected date</p>
                  <p className="tnum mt-1 text-[15px] font-bold">{formatLongDay(session.start)} · {formatClock(session.start)}</p>
                  <p className="mt-0.5 text-[12px] text-muted">Local time at the venue ({zoneLabel(event.timezone, session.start)})</p>
                  <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                    <p className="text-[18px]">
                      {selectedTier ? <TicketPrice price={selectedTier.price} fee={bookingFee(selectedTier.price, rule, event.currency)} currency={event.currency} from /> : <span className="text-[14px] font-semibold text-muted">This date is sold out</span>}
                    </p>
                    <a href="#dates-and-tickets" className="inline-flex min-h-11 items-center text-[13px] font-semibold text-citron underline underline-offset-4">Change date</a>
                  </div>
                </>
              ) : <p className="text-[14px] text-muted">No upcoming dates available.</p>}
              <div className="mt-3">
                {session && selectedTier && (
                  <Link href={`/events/${event.id}/book?session=${session.id}`} className="flex min-h-12 items-center justify-center rounded-full bg-citron px-6 text-[15px] font-bold text-ink">Choose tickets</Link>
                )}
              </div>
            </section>
            <div className="mt-3 flex flex-wrap gap-2">
              <SaveButton eventId={event.id} title={event.title} initial={saved.has(event.id)} variant="pill" />
              <ShareButton title={event.title} path={`/events/${event.id}${session ? `?session=${session.id}` : ""}`} />
              {!isDraft && <AddToBoard eventId={event.id} boards={boards.filter((b) => b.cityId === event.cityId).map((b) => ({ id: b.id, name: b.name, has: b.items.some((i) => i.eventId === event.id) }))} signedIn={!!account} autoOpen={sp.plan === "1"} />}
            </div>
          </header>

          {reason && (
            <Section title="Why it might suit you">
              <p>{reason.text}.</p>
              <p className="mt-1 text-[12px] text-muted">Based on Qloo&apos;s cultural associations with the interests you added. It&apos;s a pointer, not a prediction that you&apos;ll enjoy it.</p>
            </Section>
          )}

          <Section title="About">
            <p>{event.description}</p>
            {event.whatYoullDo.length > 0 && (
              <>
                <h3 className="mt-3 font-semibold text-ivory">What you&apos;ll do</h3>
                <List items={event.whatYoullDo} />
              </>
            )}
            {event.audience && (
              <>
                <h3 className="mt-3 font-semibold text-ivory">Who it&apos;s for</h3>
                <p>{event.audience}</p>
              </>
            )}
          </Section>

          {event.movie && (
            <Section title="Film details">
              <Facts
                rows={[
                  ["Language", event.movie.language],
                  ["Subtitles", event.movie.subtitles],
                  ["Released", event.film?.year],
                  ["Genres", event.film?.genres.join(", ")],
                  ["Runtime", event.movie.runtimeMin ? `${event.movie.runtimeMin} min` : undefined],
                  ["Certification", event.movie.certification],
                  ["Screening", session ? `${formatLongDay(session.start)}, ${formatClock(session.start)}` : undefined],
                  ["Seating", event.seatLayout ? "Reserved seats, chosen when you book" : undefined],
                ]}
              />
              {event.film && (
                <p className="mt-2 text-[12px] text-muted">
                  Film details{event.film.imageCredit ? " and image" : ""} via Qloo. A released film at a fictional sample cinema; showtimes are made up.
                  {event.movie.runtimeMin ? "" : " Runtime isn't listed, so screenings are planned as 3-hour slots."}
                </p>
              )}
            </Section>
          )}
          {event.show && (
            <Section title="Show details">
              <Facts
                rows={[
                  ["Performers", event.show.performers.join(", ")],
                  ["Doors", session && event.show.doorsBeforeMin ? formatClock(addMinutesLocal(session.start, -event.show.doorsBeforeMin)) : undefined],
                  ["Starts", session ? formatClock(session.start) : undefined],
                  ["Seating", event.show.seating],
                ]}
              />
            </Section>
          )}
          {event.class && (
            <Section title="Class details">
              <Facts rows={[["Level", event.class.level], ["Materials", event.class.materials], ["Session length", `${Math.round(event.class.durationMin / 6) / 10} hours`]]} />
            </Section>
          )}
          {event.trek && (
            <Section title="Trek details (from the organizer)">
              <Facts
                rows={[
                  ["Difficulty", event.trek.difficulty],
                  ["Distance", event.trek.distanceKm ? `${event.trek.distanceKm} km` : undefined],
                  ["Elevation gain", event.trek.elevationM ? `${event.trek.elevationM} m` : undefined],
                  ["Meeting point", event.trek.meetingPoint],
                  ["Transport", event.trek.transport],
                ]}
              />
              <h3 className="mt-3 font-semibold text-ivory">Equipment</h3>
              <List items={event.trek.equipment} />
              <h3 className="mt-3 font-semibold text-ivory">Itinerary</h3>
              <ol className="mt-1 space-y-1">
                {event.trek.itinerary.map((s) => (
                  <li key={s.time + s.step} className="tnum flex gap-3">
                    <span className="w-12 flex-none text-muted">{s.time}</span>
                    {s.step}
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {(event.inclusions?.length || event.exclusions?.length || event.bring?.length) && (
            <Section title="What's included">
              {event.inclusions?.length ? (<><h3 className="font-semibold text-ivory">Included</h3><List items={event.inclusions} /></>) : null}
              {event.exclusions?.length ? (<><h3 className="mt-3 font-semibold text-ivory">Not included</h3><List items={event.exclusions} /></>) : null}
              {event.bring?.length ? (<><h3 className="mt-3 font-semibold text-ivory">What to bring</h3><List items={event.bring} /></>) : null}
            </Section>
          )}
          {(event.restrictions?.length || event.cancellation) && (
            <Section title="Rules and cancellation">
              <List items={event.restrictions} />
              {event.cancellation && <p className="mt-2">{event.cancellation}</p>}
            </Section>
          )}
          {organizer && (
            <Section title="Organizer">
              <p className="font-semibold text-ivory">{organizer.name}</p>
              <p>{organizer.about}</p>
            </Section>
          )}
          {mappings.length > 0 && (
            <Section title="Taste data">
              <ul className="space-y-1 text-[13px]">
                {mappings.map((m) => (
                  <li key={m.qlooId}>
                    <span className="font-semibold">{m.qlooName}</span> · {m.match === "direct" ? "direct match" : "approximate"}: {m.note}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <aside id="dates-and-tickets" className="flex scroll-mt-24 flex-col gap-4 lg:sticky lg:top-20 lg:self-start" aria-label="Dates and tickets">
          <section className="rounded-[24px] border border-line bg-card p-5">
            <h2 className="text-[15px] font-bold">Dates</h2>
            <p className="text-[12px] text-muted">Local time at the venue ({session ? zoneLabel(event.timezone, session.start) : event.timezone}) · prices in {event.currency}</p>
            {upcoming.length === 0 ? (
              <p className="mt-3 text-[14px] text-muted">No upcoming dates. Save it to keep it on your list.</p>
            ) : (
              <ul className="mt-3 flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
                {upcoming.slice(0, 20).map((s) => {
                  const av = sessionAvailability(s, sold[s.id] ?? {}, now);
                  const on = s.id === session?.id;
                  return (
                    <li key={s.id}>
                      <Link
                        href={`/events/${event.id}?session=${s.id}${sp.back ? `&back=${encodeURIComponent(sp.back)}` : ""}`}
                        scroll={false}
                        aria-current={on ? "true" : undefined}
                        className={`flex min-h-12 items-center justify-between gap-2 rounded-[14px] border px-3 ${on ? "border-citron bg-citron/10" : "border-ivory/15 hover:border-ivory/40"}`}
                      >
                        <span className="tnum text-[14px] font-semibold">
                          {formatDay(s.start)} · {formatClock(s.start)}
                        </span>
                        <AvailabilityBadge status={av.status} left={av.left} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          {session && (
            <section className="rounded-[24px] border border-line bg-card p-5">
              <h2 className="text-[15px] font-bold">Tickets for {formatDay(session.start)}</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {session.tiers.map((t) => {
                  const left = remaining(t, sold[session.id] ?? {});
                  const fee = bookingFee(t.price, rule, event.currency);
                  return (
                    <li key={t.id} className="flex items-center justify-between gap-3 rounded-[14px] border border-ivory/10 px-3 py-2.5">
                      <span>
                        <span className="block text-[14px] font-semibold">{t.name}</span>
                        <span className="tnum block text-[12px] text-muted">{left === 0 ? "Sold out" : `${left} of ${t.capacity} left`}</span>
                      </span>
                      <span className="tnum text-right">
                        <TicketPrice price={t.price} fee={fee} currency={event.currency} />
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-[12px] text-muted">{feeLabel(rule)} per ticket. Demo reservation only: no payment is taken and seats aren&apos;t guaranteed.</p>
              <Link href={`/events/${event.id}/book?session=${session.id}`} className="mt-3 flex h-12 items-center justify-center rounded-full bg-citron text-[15px] font-bold text-ink">
                Choose tickets
              </Link>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
