import Link from "next/link";
import { OrgProfileForm, SignOutButton } from "@/components/organizer/AccountControls";
import { TitleLabCard } from "@/components/organizer/TitleLab";
import { CITIES, cityById } from "@/lib/locations";
import { remaining } from "@/lib/events";
import { formatDayTime, nowIn } from "@/lib/tz";
import { clusterWishes } from "@/lib/wishes";
import { metricsFor } from "@/lib/server/analytics";
import { allEvents, soldMaps } from "@/lib/server/catalog";
import { orgEvents, requireOrgPage } from "@/lib/server/organizer";
import { qlooUsage } from "@/lib/server/qloo";
import { titleLabsFor } from "@/lib/server/titleLab";
import { allWishes } from "@/lib/server/wishes";

export default async function OrganizerHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { sim } = await searchParams;
  const org = await requireOrgPage("/organizer");
  const events = await orgEvents(org.id, await allEvents());
  const sold = await soldMaps(events);
  const metrics = await Promise.all(events.map((e) => metricsFor(e.id)));
  const clusters = clusterWishes(await allWishes(), { cityId: org.cityId, sinceDays: 30 }).slice(0, 3);
  const usage = await qlooUsage();
  const published = events.filter((e) => e.status === "published");
  const labs = await titleLabsFor(published.map((e) => e.id));
  // Events with a lab first, then the rest in their usual order.
  const labEvents = [...published].sort((a, b) => Number(labs.has(b.id)) - Number(labs.has(a.id)));
  const city = cityById(org.cityId);
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pt-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-citron">Organizer workspace</p>
          <h1 className="font-display text-[26px]">{org.name}</h1>
          <p className="text-[13px] text-muted">{city?.name ?? org.cityId}{org.isSample ? " · demo account for a sample organizer; its listings are fictional" : ""}</p>
          <p className="text-[12px] text-muted">Signed in as {org.account.email}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Link href="/organizer/events/new" className="flex h-11 items-center rounded-full bg-citron px-5 font-bold text-ink">Create event</Link>
          <Link href="/organizer/demand" className="flex h-11 items-center rounded-full border border-ivory/25 px-5 font-semibold">Demand from wishes</Link>
          <SignOutButton />
        </div>
      </div>

      {!org.isSample && (
        <details className="rounded-[20px] border border-line bg-card p-4">
          <summary className="cursor-pointer text-[14px] font-semibold">Organization profile</summary>
          <div className="mt-3"><OrgProfileForm name={org.name} about={org.about} cityId={org.cityId} cities={CITIES.map((c) => ({ id: c.id, name: `${c.name}, ${c.country}` }))} /></div>
        </details>
      )}

      <section aria-labelledby="ev-h">
        <h2 id="ev-h" className="text-[16px] font-bold">Events</h2>
        {events.length === 0 ? (
          <p className="mt-2 rounded-[20px] border border-dashed border-ivory/20 p-5 text-[14px] text-muted">No events yet. Create one, or start from a demand cluster.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-[20px] border border-line">
            <table className="w-full min-w-[720px] text-[14px]">
              <thead className="bg-card text-left text-[12px] text-muted">
                <tr><th className="p-3">Event</th><th className="p-3">Status</th><th className="p-3">Next date</th><th className="p-3">Seats sold</th><th className="p-3">Views</th><th className="p-3">Reservations</th><th className="p-3"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {events.map((e, i) => {
                  const next = e.sessions.find((s) => s.start > nowIn(e.timezone) && !s.cancelled);
                  const cap = next ? next.tiers.reduce((n, t) => n + t.capacity, 0) : 0;
                  const left = next ? next.tiers.reduce((n, t) => n + remaining(t, sold[next.id] ?? {}), 0) : 0;
                  return (
                    <tr key={e.id} className="border-t border-line">
                      <td className="p-3 font-semibold">{e.title}<span className="block text-[12px] font-normal text-muted">{e.category}{e.source === "sample" ? " · sample" : ""}</span></td>
                      <td className="p-3 capitalize">{e.status}</td>
                      <td className="tnum p-3">{next ? formatDayTime(next.start) : "None"}</td>
                      <td className="tnum p-3">{next ? `${cap - left} / ${cap}` : "–"}</td>
                      <td className="tnum p-3">{metrics[i].view ?? 0}</td>
                      <td className="tnum p-3">{metrics[i].reservation ?? 0}</td>
                      <td className="p-3"><Link href={`/organizer/events/${e.id}`} className="font-semibold text-citron">Manage</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[12px] text-muted">Seats sold include sample seed sales and demo reservations. No payments are processed.</p>
      </section>

      <section aria-labelledby="tl-h">
        <h2 id="tl-h" className="text-[16px] font-bold">Title lab</h2>
        <p className="mt-1 max-w-3xl text-[13px] text-muted">
          Get five different card titles per event from AI test and learns which works best for your audience. 
         
        </p>
        {published.length === 0 ? (
          <p className="mt-2 text-[14px] text-muted">Publish an event to start a title lab.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {labEvents.map((e) => (
              <TitleLabCard key={e.id} event={e} lab={labs.get(e.id)} simulated={sim === e.id} toggleHref={sim === e.id ? `/organizer#tl-${e.id}` : `/organizer?sim=${encodeURIComponent(e.id)}#tl-${e.id}`} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="dem-h">
        <div className="flex items-center justify-between">
          <h2 id="dem-h" className="text-[16px] font-bold">Top demand near {city?.name}</h2>
          <Link href="/organizer/demand" className="text-[13px] font-semibold text-citron">All clusters</Link>
        </div>
        {clusters.length === 0 ? (
          <p className="mt-2 text-[14px] text-muted">No opted-in wishes in {city?.name} in the last 30 days.</p>
        ) : (
          <ul className="mt-3 grid gap-3 md:grid-cols-3">
            {clusters.map((c) => (
              <li key={c.key} className="rounded-[20px] border border-line bg-card p-4">
                <p className="font-semibold">{[c.category ?? "Any activity", c.keyword].filter(Boolean).join(" · ")}</p>
                <p className="tnum text-[13px]">{c.realCount} real · <span className="text-muted">{c.seedCount} sample</span></p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-[12px] text-muted">Qloo usage this month: {usage.used} of {usage.budget} calls (throttled to {usage.rps}/s).</p>
    </main>
  );
}
