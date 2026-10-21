import Link from "next/link";
import { EventCard } from "@/components/EventCard";
import { NewBoardForm } from "@/components/boards/BoardActions";
import { evaluate } from "@/lib/discovery";
import { cityById } from "@/lib/locations";
import { nowIn } from "@/lib/tz";
import { listBoards } from "@/lib/server/boards";
import { feeRuleFor, getEvent, soldMaps } from "@/lib/server/catalog";
import { currentUid } from "@/lib/server/identity";
import { savedIds } from "@/lib/server/saved";
import { listSavedSearches } from "@/lib/server/savedSearches";
import { isShared } from "@/lib/server/store";
import { RemoveSavedSearch } from "./RemoveSavedSearch";

export default async function SavedPage() {
  const uid = await currentUid();
  const ids = [...(await savedIds(uid))];
  const events = (await Promise.all(ids.map(getEvent))).filter((e) => !!e);
  const sold = await soldMaps(events);
  const [boards, searches] = await Promise.all([listBoards(uid), listSavedSearches(uid)]);
  const cards = events.map((e) => {
    const r = evaluate(e, sold, { cityId: e.cityId, nowLocal: nowIn(e.timezone), includeSoldOut: true }, feeRuleFor(e.cityId));
    return { e, offer: "offer" in r ? r.offer : null };
  });

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pt-6 sm:px-6">
      <h1 className="font-display text-[24px]">Saved</h1>

      <section aria-labelledby="boards-h">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="boards-h" className="text-[16px] font-bold">Plan with friends</h2><Link href="/friends" className="inline-flex min-h-11 items-center text-[13px] font-semibold text-citron">All group plans →</Link></div>
        <p className="mt-1 text-[13px] text-muted">
          Share a board link so friends can add events, vote and note their budget and dates. No sign-up needed.
          {!isShared() && " Preview only on this deployment: boards aren't stored persistently, so other people won't see your changes."}
        </p>
        <div className="mt-3"><NewBoardForm /></div>
        {boards.length > 0 && (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {boards.map((b) => (
              <li key={b.id}>
                <Link href={`/boards/${b.id}`} className="block rounded-[20px] border border-line bg-card p-4 hover:border-ivory/30">
                  <p className="font-display text-[15px]">{b.name}</p>
                  <p className="tnum mt-1 text-[13px] text-muted">
                    {b.items.length} option{b.items.length === 1 ? "" : "s"} · {Object.keys(b.participants).length} people · {b.cityName}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="events-h">
        <h2 id="events-h" className="text-[16px] font-bold">Saved events</h2>
        {cards.length === 0 ? (
          <p className="mt-2 text-[14px] text-muted">
            Nothing saved yet. Tap the bookmark on any event. <Link href="/" className="font-semibold text-citron">Explore</Link>
          </p>
        ) : (
          <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map(({ e, offer }) => (
              <li key={e.id}>
                {offer ? (
                  <EventCard offer={offer} saved returnTo="/saved" />
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
      </section>

      <section aria-labelledby="searches-h">
        <h2 id="searches-h" className="text-[16px] font-bold">Saved searches</h2>
        {searches.length === 0 ? (
          <p className="mt-2 text-[14px] text-muted">Save a search from Explore when nothing fits yet.</p>
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
    </main>
  );
}
