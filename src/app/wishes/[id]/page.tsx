import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { cityById } from "@/lib/locations";
import { centroid } from "@/lib/geo";
import { formatMoney } from "@/lib/tz";
import { clusterWishes } from "@/lib/wishes";
import { getEvent, publishedEvents } from "@/lib/server/catalog";
import { currentUid } from "@/lib/server/identity";
import { getTaste } from "@/lib/server/taste";
import { allWishes, getWish } from "@/lib/server/wishes";
import { WishForm } from "../new/WishForm";
import { WithdrawWish } from "./WithdrawWish";

export default async function WishPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const uid = await currentUid();
  const w = await getWish(id);
  if (!w || w.uid !== uid) notFound();
  const cluster = w.notify ? clusterWishes(await allWishes()).find((c) => c.members.some((m) => m.id === w.id)) : undefined;
  const proposals = (await Promise.all(w.proposals.map(async (p) => ({ ...p, event: await getEvent(p.eventId) })))).filter((p) => p.event);
  const loc = cityById(w.location.cityId);
  const events = await publishedEvents(w.location.cityId);
  const areas = [...new Set(events.map((e) => e.venue.area))].sort().map((name) => ({ name, ...centroid(events.filter((e) => e.venue.area === name).map((e) => e.venue))! }));
  const taste = await getTaste(uid);

  return (
    <main className="mx-auto max-w-2xl px-4 pt-4 sm:px-6">
      <BackLink href="/wishes" label="My wishes" />
      {sp.new === "1" && <p role="status" className="mb-3 rounded-[16px] bg-citron p-3 text-[14px] font-semibold text-ink">Wish saved. {w.notify ? "It now counts towards demand that organizers can see." : "It's private, so it isn't counted."}</p>}
      <h1 className="font-display text-[22px]">Your wish</h1>
      <p className="mt-1 text-[14px]">
        Status: <span className="font-semibold text-citron">{w.status === "open" ? "Open, waiting for an organizer" : w.status === "proposed" ? "An organizer proposed an event" : "Withdrawn"}</span>
      </p>

      {proposals.length > 0 && (
        <section className="mt-4 rounded-[24px] border border-citron/50 bg-card p-5">
          <h2 className="text-[15px] font-bold text-citron">Proposals</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {proposals.map((p) => (
              <li key={p.eventId} className="flex items-center justify-between gap-3">
                <span className="font-semibold">{p.event!.title}</span>
                <Link href={`/events/${p.eventId}`} className="flex h-10 items-center rounded-full bg-citron px-4 text-[13px] font-bold text-ink">View and reserve</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {cluster && (
        <section className="mt-4 rounded-[24px] border border-line bg-card p-5">
          <h2 className="text-[15px] font-bold">Compatible wishes</h2>
          <p className="tnum mt-1 text-[14px]">
            {cluster.realCount - 1} other {cluster.realCount - 1 === 1 ? "person" : "people"} on Offbeat <span className="text-muted">+ {cluster.seedCount} sample records (demo data)</span>
          </p>
          <p className="mt-2 text-[13px] text-ivory/80">Grouped because every stated constraint overlaps: {cluster.explanation}.</p>
          <p className="mt-1 text-[12px] text-muted">Interest isn&apos;t a purchase commitment, and organizers only see totals.</p>
        </section>
      )}

      {w.status !== "withdrawn" ? (
        <section className="mt-6">
          <h2 className="text-[15px] font-bold">Edit</h2>
          <WishForm
            location={loc ?? { id: w.location.cityId, name: w.location.cityName, country: "", countryCode: "XX", lat: w.location.lat, lng: w.location.lng, timezone: "UTC", currency: w.currency }}
            areas={areas}
            interests={taste.interests.map((i) => ({ id: i.id, name: i.name }))}
            prefill={{ category: null, keywords: [], from: null, to: null, budgetMax: null, area: null }}
            existing={{ id: w.id, input: w }}
          />
          <div className="mt-4"><WithdrawWish id={w.id} /></div>
        </section>
      ) : (
        <p className="mt-4 text-[14px] text-muted">
          This wish is withdrawn and no longer counted. <WithdrawWish id={w.id} reopen />
        </p>
      )}
      <p className="tnum mt-6 text-[12px] text-muted">Budget shown in {w.currency}{w.budgetMax !== null ? ` (up to ${formatMoney(w.budgetMax, w.currency)})` : ""}.</p>
    </main>
  );
}
