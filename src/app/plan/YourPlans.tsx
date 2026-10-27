import Image from "next/image";
import Link from "next/link";
import { formatClock, formatDayTime, formatMoney } from "@/lib/tz";
import type { PlanView } from "@/lib/server/plans";
import { RemovePlan } from "./PlanControls";

const STATUS: Record<PlanView["status"], { text: string; tone: string } | null> = {
  upcoming: null,
  past: { text: "Already happened", tone: "bg-raised text-muted" },
  "sold-out": { text: "Not enough seats left", tone: "bg-raised text-ivory" },
  cancelled: { text: "Date cancelled", tone: "bg-raised text-ivory" },
  unavailable: { text: "No longer available", tone: "bg-raised text-muted" },
};

/** Your saved individual plans, with live availability. */
export function YourPlans({ plans }: { plans: PlanView[] }) {
  return (
    <section aria-labelledby="my-plans-h">
      <h2 id="my-plans-h" className="font-display text-[18px]">Your plans</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {plans.map((p) => {
          const title = p.event?.title ?? "Event removed";
          const badge = STATUS[p.status];
          return (
            <li key={p.id} className={`flex flex-col overflow-hidden rounded-[22px] border border-line bg-card ${p.status === "past" ? "opacity-70" : ""}`}>
              <div className="flex gap-3 p-3">
                {p.event ? <Image src={p.event.image} alt="" width={96} height={96} className="size-24 flex-none rounded-[14px] object-cover" /> : <span className="size-24 flex-none rounded-[14px] bg-raised" />}
                <div className="min-w-0 flex-1">
                  {badge && <span className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${badge.tone}`}>{badge.text}</span>}
                  <p className="font-display text-[15px] leading-snug">{title}</p>
                  {p.start && <p className="tnum text-[13px] text-ivory/80">{formatDayTime(p.start)}</p>}
                  {p.event && <p className="truncate text-[13px] text-muted">{p.event.venue.name} · {p.event.venue.area}</p>}
                </div>
              </div>
              <dl className="tnum grid gap-0.5 border-t border-line px-3 py-2 text-[13px]">
                <div className="flex justify-between"><dt>{p.tierName ?? "Tickets"} × {p.party} incl. fees</dt><dd>{formatMoney(p.ticketsTotal, p.currency)}</dd></div>
                {p.dinner && <div className="flex justify-between text-ivory/80"><dt>Dinner: {p.dinner.name}, {formatClock(p.dinner.start)} (estimate)</dt><dd>~{formatMoney(p.dinner.estimate, p.currency)}</dd></div>}
                <div className="flex justify-between font-bold"><dt>{p.dinner ? "Estimated total" : "Total"}</dt><dd>{formatMoney(p.total, p.currency)}</dd></div>
              </dl>
              <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
                {p.status === "upcoming" && p.event && (
                  <Link href={`/events/${p.eventId}/book?session=${p.sessionId}&qty=${p.party}&from=plan`} className="flex h-10 items-center rounded-full bg-citron px-4 text-[13px] font-bold text-ink">Choose tickets</Link>
                )}
                {p.event && <Link href={`/events/${p.eventId}?session=${p.sessionId}&back=/plan`} className="flex h-10 items-center rounded-full border border-ivory/25 px-4 text-[13px] font-semibold">View event</Link>}
                <RemovePlan id={p.id} title={title} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[12px] text-muted">Saving a plan doesn&apos;t hold seats; prices are as of when you saved it. Dinner is a sample suggestion and isn&apos;t booked.</p>
    </section>
  );
}
