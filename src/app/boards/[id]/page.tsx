import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TicketPrice } from "@/components/TicketPrice";
import { BoardItemAction, CopyLink, MyConstraintsForm, RenameBoard, VoteButton } from "@/components/boards/BoardActions";
import { discover, evaluate, sortOffers } from "@/lib/discovery";
import { formatRange } from "@/lib/dateRange";
import { formatDayTime, formatMoney, nowIn } from "@/lib/tz";
import { cityById } from "@/lib/locations";
import { getBoard, groupConstraints } from "@/lib/server/boards";
import { feeRuleFor, getEvent, publishedEvents, soldMaps } from "@/lib/server/catalog";
import { currentUid } from "@/lib/server/identity";
import { savedIds } from "@/lib/server/saved";
import { isShared } from "@/lib/server/store";
import { getTaste, rankByTaste, type Interest } from "@/lib/server/taste";

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const board = await getBoard(id);
  if (!board) notFound();
  const uid = await currentUid();
  const city = cityById(board.cityId);
  const tz = city?.timezone ?? "UTC";
  const now = nowIn(tz);
  const gc = groupConstraints(board);
  const range = !gc.conflict && (gc.from || gc.to) ? { from: gc.from ?? now.slice(0, 10), to: gc.to ?? "2099-12-31" } : null;

  const items = (await Promise.all(board.items.map(async (i) => ({ ...i, event: await getEvent(i.eventId) })))).filter((i) => i.event);
  const itemEvents = items.map((i) => i.event!);
  const sold = await soldMaps(itemEvents);
  const shortlist = items
    .map((i) => {
      const e = i.event!;
      const votes = board.votes[e.id]?.length ?? 0;
      const fits = evaluate(e, sold, { cityId: e.cityId, nowLocal: nowIn(e.timezone), range, maxPrice: gc.budgetMax, partySize: 1 }, feeRuleFor(e.cityId));
      const any = evaluate(e, sold, { cityId: e.cityId, nowLocal: nowIn(e.timezone), includeSoldOut: true }, feeRuleFor(e.cityId));
      return { e, votes, voted: board.votes[e.id]?.includes(uid) ?? false, fit: "offer" in fits ? fits.offer : null, next: "offer" in any ? any.offer : null, why: "dropped" in fits ? fits.dropped : null };
    })
    .sort((a, b) => b.votes - a.votes || (a.next?.session.start ?? "z").localeCompare(b.next?.session.start ?? "z"));

  // Suggestions: events in the board's city that meet every stated constraint, optionally ordered by the
  // combined interests of participants who chose to add some.
  const cityEvents = await publishedEvents(board.cityId);
  const cityEventsSold = await soldMaps(cityEvents);
  const onBoard = new Set(board.items.map((i) => i.eventId));
  const fitting = gc.conflict ? [] : discover(cityEvents, cityEventsSold, { cityId: board.cityId, nowLocal: now, range, maxPrice: gc.budgetMax, partySize: Math.max(1, gc.people) }, feeRuleFor).offers.filter((o) => !onBoard.has(o.event.id));
  const tastes = await Promise.all(Object.keys(board.participants).map(getTaste));
  const interests: Interest[] = [...new Map(tastes.flatMap((t) => t.interests).map((i) => [i.id, i])).values()].slice(0, 10);
  const ranking = interests.length ? await rankByTaste(interests, fitting.map((o) => o.event)) : null;
  const suggestions = sortOffers(fitting, ranking?.status === "ranked" ? "relevance" : "soonest", ranking?.rank).slice(0, 4);
  const saved = [...(await savedIds(uid))].filter((s) => !onBoard.has(s));
  const savedEvents = (await Promise.all(saved.map(getEvent))).filter((e) => e && e.cityId === board.cityId);
  const me = board.participants[uid] ?? {};

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 pt-6 sm:px-6">
      <header className="flex flex-col gap-2">
        <Link href="/friends" className="inline-flex min-h-11 items-center text-[13px] font-semibold text-citron">← All group plans</Link>
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-citron">Plan with friends · {board.cityName}</p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-[24px]">{board.name}</h1>
          <RenameBoard boardId={board.id} name={board.name} />
        </div>
        <p className="text-[14px] text-ivory/80">Add a few options, invite your friends, then vote on your favorite.</p>
        <div className="flex flex-wrap gap-2">
          <CopyLink path={`/boards/${board.id}`} />
          <Link href="/" className="flex h-11 items-center rounded-full border border-ivory/25 px-4 text-[14px] font-semibold">Find more events</Link>
        </div>
        {!isShared() && (
          <p role="status" className="rounded-[16px] border border-dashed border-citron/50 p-3 text-[13px] text-citron">
            Preview: this deployment has no shared storage, so votes and changes stay on this server instance and may disappear. Configure Upstash Redis to share boards.
          </p>
        )}
      </header>

      <ol aria-label="Group planning steps" className="grid gap-2 text-[13px] sm:grid-cols-3">
        <li className="rounded-[16px] border border-line bg-card p-3"><span className="font-bold text-citron">1. Add options</span><span className="mt-1 block text-muted">Choose suggestions below or add an event you like.</span></li>
        <li className="rounded-[16px] border border-line bg-card p-3"><span className="font-bold text-citron">2. Invite friends</span><span className="mt-1 block text-muted">Send the invite link so they can join and vote.</span></li>
        <li className="rounded-[16px] border border-line bg-card p-3"><span className="font-bold text-citron">3. Choose together</span><span className="mt-1 block text-muted">Open your chosen event to select tickets.</span></li>
      </ol>

      <section aria-labelledby="short-h">
        <h2 id="short-h" className="text-[16px] font-bold">Shortlist</h2>
        <p className="text-[13px] text-muted">Sorted by votes. Anyone with the link can vote once per option.</p>
        {shortlist.length === 0 ? (
          <p className="mt-3 rounded-[20px] border border-dashed border-ivory/20 p-5 text-[14px] text-muted">No options yet. Add from your saved events below, or from the suggestions.</p>
        ) : (
          <ol className="mt-3 flex flex-col gap-3">
            {shortlist.map(({ e, votes, voted, fit, next, why }) => (
              <li key={e.id} className="flex flex-col gap-3 rounded-[20px] border border-line bg-card p-3 sm:flex-row sm:items-center">
                <Image src={e.image} alt="" width={112} height={80} className="h-20 w-28 flex-none rounded-[14px] object-cover" />
                <div className="min-w-0 flex-1">
                  <Link href={`/events/${e.id}?${next ? `session=${next.session.id}&` : ""}back=/boards/${board.id}`} className="font-display text-[15px] hover:text-citron">{e.title}</Link>
                  <p className="tnum text-[13px] text-ivory/80">
                    {next ? formatDayTime(next.session.start) : "No upcoming dates"}
                    {next?.fromPrice != null && <TicketPrice price={next.fromPrice} fee={next.fee ?? 0} currency={e.currency} from />}
                  </p>
                  <p className={`text-[12px] ${fit ? "text-citron" : "text-muted"}`}>
                    {gc.budgetsGiven || gc.datesGiven ? (fit ? "Fits everyone's stated budget and dates" : `Doesn't fit the group: ${why === "price" ? "over the lowest budget" : why === "date" ? "no dates everyone is free" : "no matching seats"}`) : "No group constraints yet"}
                  </p>
                </div>
                <div className="flex flex-none items-center gap-2">
                  <VoteButton boardId={board.id} eventId={e.id} voted={voted} count={votes} title={e.title} />
                  <BoardItemAction boardId={board.id} eventId={e.id} action="remove" label="Remove" />
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="group-h" className="rounded-[24px] border border-line bg-card p-5">
        <h2 id="group-h" className="text-[16px] font-bold">Group budget and dates</h2>
        <p className="tnum mt-1 text-[13px] text-muted">
          {gc.people} {gc.people === 1 ? "person" : "people"} on this board ·{" "}
          {gc.budgetMax !== null ? `lowest budget ${formatMoney(gc.budgetMax, board.currency)} (${gc.budgetsGiven} shared)` : "no budgets shared"} ·{" "}
          {gc.conflict ? "stated dates don't overlap" : range ? `everyone free ${formatRange({ from: range.from, to: range.to === "2099-12-31" ? range.from : range.to })}${range.to === "2099-12-31" ? " onwards" : ""}` : "no dates shared"}
        </p>
        <div className="mt-4">
          <MyConstraintsForm boardId={board.id} initial={me} currency={board.currency} />
        </div>
        <ul className="mt-4 flex flex-col gap-1 text-[13px] text-ivory/80">
          {Object.entries(board.participants).map(([pid, p]) => (
            <li key={pid}>
              {pid === uid ? "You" : (p.name ?? "Someone")}
              {p.budgetMax !== undefined ? ` · up to ${formatMoney(p.budgetMax, board.currency)}` : ""}
              {p.from || p.to ? ` · free ${p.from ?? "…"} to ${p.to ?? "…"}` : ""}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sugg-h">
        <h2 id="sugg-h" className="text-[16px] font-bold">Suggestions that fit the group</h2>
        <p className="text-[13px] text-muted">
          Only events with enough seats for {Math.max(1, gc.people)}, inside everyone&apos;s stated dates and the lowest stated budget.
          {ranking?.status === "ranked"
            ? ` Ordered using the combined interests of participants who added some (via Qloo). Shared taste doesn't guarantee everyone will agree.`
            : " Ordered by date."}
        </p>
        {gc.conflict ? (
          <p className="mt-3 text-[14px] text-citron">The dates people gave don&apos;t overlap. Ask someone to widen theirs.</p>
        ) : suggestions.length === 0 ? (
          <p className="mt-3 text-[14px] text-muted">Nothing else fits everyone right now.</p>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {suggestions.map((o) => (
              <li key={o.event.id} className="flex items-center gap-3 rounded-[18px] border border-line bg-card p-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/events/${o.event.id}?session=${o.session.id}&back=/boards/${board.id}`} className="font-semibold hover:text-citron">{o.event.title}</Link>
                  <p className="tnum text-[12px] text-muted">{formatDayTime(o.session.start)}</p>
                  {o.fromPrice != null && <p className="mt-1 text-[13px]"><TicketPrice price={o.fromPrice} fee={o.fee ?? 0} currency={o.event.currency} from /></p>}
                  {ranking?.reasons.get(o.event.id) && <p className="line-clamp-2 text-[12px] text-ivory/70">{ranking.reasons.get(o.event.id)!.text}</p>}
                </div>
                <BoardItemAction boardId={board.id} eventId={o.event.id} action="add" label="Add" />
              </li>
            ))}
          </ul>
        )}
      </section>

      {savedEvents.length > 0 && (
        <section aria-labelledby="fromsaved-h">
          <h2 id="fromsaved-h" className="text-[16px] font-bold">Add from your saved events</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {savedEvents.map((e) => (
              <li key={e!.id} className="flex items-center justify-between gap-3 rounded-[16px] border border-line bg-card px-4 py-2">
                <span className="truncate text-[14px] font-semibold">{e!.title}</span>
                <BoardItemAction boardId={board.id} eventId={e!.id} action="add" label="Add" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
