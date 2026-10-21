import Link from "next/link";
import { formatMoney } from "@/lib/tz";
import { clusterWishes } from "@/lib/wishes";
import { currentUid } from "@/lib/server/identity";
import { allWishes, myWishes } from "@/lib/server/wishes";

const STATUS = { open: "Open: waiting for an organizer", proposed: "Proposal received", withdrawn: "Withdrawn" } as const;

export default async function WishesPage() {
  const uid = await currentUid();
  const mine = await myWishes(uid);
  const clusters = clusterWishes(await allWishes());
  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px]">My wishes</h1>
          <p className="mt-1 text-[14px] text-ivory/75">Describe something you&apos;d go to that doesn&apos;t exist yet. Organizers see grouped totals, never your name.</p>
        </div>
        <Link href="/wishes/new" className="flex h-11 items-center rounded-full bg-citron px-5 font-bold text-ink">New wish</Link>
      </div>
      {mine.length === 0 ? (
        <p className="mt-6 rounded-[24px] border border-dashed border-ivory/20 p-6 text-[14px] text-muted">You haven&apos;t made a wish yet.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {mine.map((w) => {
            const c = clusters.find((cl) => cl.members.some((m) => m.id === w.id));
            return (
              <li key={w.id}>
                <Link href={`/wishes/${w.id}`} className="block rounded-[20px] border border-line bg-card p-4 hover:border-ivory/30">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-citron">{STATUS[w.status]}</p>
                  <p className="mt-1 font-semibold">{[w.category, w.keywords.join(", ")].filter(Boolean).join(" · ") || "Anything"} in {w.location.area ? `${w.location.area}, ` : ""}{w.location.cityName}</p>
                  <p className="tnum text-[13px] text-muted">
                    {w.from && w.to ? `${w.from} to ${w.to}` : "Any dates"} · {w.budgetMax !== null ? `up to ${formatMoney(w.budgetMax, w.currency)}` : "no budget given"} · {w.notify ? "counted and notified" : "private (not counted)"}
                  </p>
                  {c && w.notify && (
                    <p className="tnum mt-1 text-[12px] text-ivory/70">
                      Compatible wishes: {c.realCount - 1} other real {c.realCount - 1 === 1 ? "person" : "people"} + {c.seedCount} sample records
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
