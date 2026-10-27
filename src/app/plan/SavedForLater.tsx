import Link from "next/link";
import { EventCard } from "@/components/EventCard";
import { evaluate } from "@/lib/discovery";
import { cityById } from "@/lib/locations";
import { nowIn } from "@/lib/tz";
import { feeRuleFor, getEvent, soldMaps } from "@/lib/server/catalog";
import { savedIds } from "@/lib/server/saved";
import { listSavedSearches } from "@/lib/server/savedSearches";
import { RemoveSavedSearch } from "./RemoveSavedSearch";

/** Saved events and saved searches (formerly the Saved tab). */
export async function SavedForLater({ uid }: { uid: string }) {
  const [ids, searches] = await Promise.all([savedIds(uid), listSavedSearches(uid)]);
  const events = (await Promise.all([...ids].map(getEvent))).filter((e) => !!e);
  const sold = await soldMaps(events);
  const cards = events.map((e) => {
    const r = evaluate(e, sold, { cityId: e.cityId, nowLocal: nowIn(e.timezone), includeSoldOut: true }, feeRuleFor(e.cityId));
    return { e, offer: "offer" in r ? r.offer : null };
  });
  return (
    <section id="saved" aria-labelledby="saved-h" className="scroll-mt-20">
      <h2 id="saved-h" className="font-display text-[18px]">Saved for later</h2>
      <h3 className="mt-3 text-[15px] font-bold">Saved events</h3>
      {cards.length === 0 ? (
        <p className="mt-1 text-[14px] text-muted">
          Nothing saved yet. Tap the bookmark on any event. <Link href="/" className="font-semibold text-citron">Explore</Link>
        </p>
      ) : (
        <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(({ e, offer }) => (
            <li key={e.id}>
              {offer ? (
                <EventCard offer={offer} saved returnTo="/plan#saved" />
              ) : (
                <div className="rounded-[24px] border border-line bg-card p-4">
                  <p className="font-display text-[15px]">{e.title}</p>
                  <p className="mt-1 text-[13px] text-muted">No upcoming dates · {cityById(e.cityId)?.name}</p>
                  <Link href={`/events/${e.id}`} className="mt-2 inline-block text-[13px] font-semibold text-citron">View details</Link>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <h3 className="mt-6 text-[15px] font-bold">Saved searches</h3>
      {searches.length === 0 ? (
        <p className="mt-1 text-[14px] text-muted">Save a search from Explore when nothing fits yet.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {searches.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 rounded-[16px] border border-line bg-card px-4 py-2">
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold">{s.label}</span>
                <span className="text-[12px] text-muted">{s.cityName}</span>
              </span>
              <span className="flex flex-none gap-2">
                <Link href={`/?${s.query}`} className="flex h-10 items-center rounded-full border border-ivory/25 px-3 text-[13px] font-semibold">Run</Link>
                <RemoveSavedSearch id={s.id} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[12px] text-muted">Saved searches don&apos;t send alerts yet; run them here. Searches run in the city you&apos;re currently exploring.</p>
    </section>
  );
}
