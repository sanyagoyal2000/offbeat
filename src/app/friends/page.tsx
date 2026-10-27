import Link from "next/link";
import { redirect } from "next/navigation";
import { NewBoardForm } from "@/components/boards/BoardActions";
import { UsersIcon, ArrowRightIcon } from "@/components/icons";
import { listBoards } from "@/lib/server/boards";
import { currentUser, exploreLocation } from "@/lib/server/identity";

export default async function FriendsPage() {
  const [{ uid, account }, location] = await Promise.all([currentUser(), exploreLocation()]);
  // Plan with friends needs an account: log in, then come straight back here.
  if (!account) redirect("/login?next=/friends");
  const boards = await listBoards(uid);
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 pt-6 sm:px-6">
      <header>
        <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-citron"><UsersIcon size={18} /> Plan together</p>
        <h1 className="mt-2 font-display text-[26px] leading-tight sm:text-[34px]">Less back-and-forth.<br />More going out.</h1>
        <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-ivory/80">Put a few events in one shared board. Invite friends to join, vote and add their budget and dates. Everyone on a board has an account, so you know who&apos;s actually in.</p>
      </header>
      <section aria-labelledby="plans-h">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="plans-h" className="font-display text-[18px]">Your group plans</h2>
        </div>
        {boards.length ? (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {boards.map((b) => <li key={b.id}>
              <Link href={`/boards/${b.id}`} className="flex items-center justify-between gap-3 rounded-[20px] border border-line bg-card p-5 hover:border-citron/40">
                <span><span className="block text-[16px] font-bold">{b.name}</span><span className="mt-1 block text-[13px] text-muted">{b.cityName} · {b.items.length} option{b.items.length === 1 ? "" : "s"} · {b.members.length} member{b.members.length === 1 ? "" : "s"}</span></span>
                <ArrowRightIcon size={20} className="flex-none text-citron" />
              </Link>
            </li>)}
          </ul>
        ) : <p className="mt-3 rounded-[20px] border border-dashed border-ivory/20 p-5 text-[14px] text-muted">No group plans yet. Start one below, or tap “Plan with friends” on an event you like.</p>}
      </section>
      <section aria-labelledby="start-h" className="rounded-[24px] border border-citron/30 bg-citron/5 p-5 sm:p-6">
        <h2 id="start-h" className="text-[18px] font-bold">Start a group plan</h2>
        <p className="mt-1 text-[13px] text-muted">Your new board is for {location.name}. A name is optional; you can change it later.</p>
        <div className="mt-4"><NewBoardForm /></div>
      </section>
      <ol aria-label="How planning with friends works" className="grid gap-3 sm:grid-cols-3">
        {[
          ["1", "Add your options", "Add events from their detail pages or choose the board’s suggestions."],
          ["2", "Invite your friends", "Share the board link. Friends log in, join, then add dates, a budget and votes."],
          ["3", "Choose together", "Compare the shortlist, then open the event to choose tickets."],
        ].map(([step, title, copy]) => (
          <li key={step} className="rounded-[20px] border border-line bg-card p-4">
            <span className="flex size-7 items-center justify-center rounded-full bg-raised text-[12px] font-bold text-citron">{step}</span>
            <h3 className="mt-3 text-[14px] font-bold">{title}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{copy}</p>
          </li>
        ))}
      </ol>
    </main>
  );
}
