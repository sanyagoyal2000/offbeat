import Image from "next/image";
import Link from "next/link";
import { cardDetail, factLabels } from "@/lib/events";
import type { Offer } from "@/lib/discovery";
import { formatDayTime } from "@/lib/tz";
import { SaveButton } from "./SaveButton";
import { TicketPrice } from "./TicketPrice";

export function AvailabilityBadge({ status, left }: { status: Offer["availability"]; left: number }) {
  const map = {
    available: ["Available", "text-ivory/80 bg-ink/70"],
    "few-left": [`${left} left`, "text-ink bg-citron"],
    "sold-out": ["Sold out", "text-ivory bg-raised"],
    past: ["Ended", "text-muted bg-raised"],
    cancelled: ["Cancelled", "text-ivory bg-raised"],
  } as const;
  const [text, cls] = map[status];
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${cls}`}>{text}</span>;
}

export function EventCard({ offer, saved, reason, priority = false, returnTo }: { offer: Offer; saved: boolean; reason?: string; priority?: boolean; returnTo?: string }) {
  const { event: e, session, fromPrice, fee } = offer;
  const href = `/events/${e.id}?session=${session.id}${returnTo ? `&back=${encodeURIComponent(returnTo)}` : ""}`;
  const facts = factLabels(e).slice(0, 2);
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[24px] border border-line bg-card">
      <div className="relative aspect-[16/10]">
        <Image src={e.image} alt="" fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" priority={priority} className={e.film ? "object-cover object-[50%_20%]" : "object-cover"} />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-ink/30" />
        <div className="absolute left-3 top-3 flex gap-1.5">
          <AvailabilityBadge status={offer.availability} left={offer.left} />
          {e.source === "sample" && <span className="rounded-full bg-ink/70 px-2.5 py-1 text-[11px] font-semibold text-ivory/80">Sample listing</span>}
        </div>
        <div className="absolute right-3 top-3 z-10">
          <SaveButton eventId={e.id} title={e.title} initial={saved} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4 pt-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-citron">
          {e.category} <span className="font-medium normal-case tracking-normal text-muted">· {cardDetail(e)}</span>
        </p>
        <h3 className="font-display text-[16px] leading-snug">
          <Link href={href} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
            {e.title}
          </Link>
        </h3>
        <p className="tnum text-[13px] text-ivory/80">
          {formatDayTime(session.start)}
          {offer.sessionCount > 1 && <span className="text-muted"> · +{offer.sessionCount - 1} more date{offer.sessionCount > 2 ? "s" : ""}</span>}
        </p>
        <p className="truncate text-[13px] text-muted">
          {e.venue.name} · {e.venue.area}
        </p>
        {facts.length > 0 && (
          <ul className="mt-0.5 flex flex-wrap gap-1.5">
            {facts.map((f) => (
              <li key={f} className="rounded-full border border-ivory/15 px-2 py-0.5 text-[11px] text-ivory/80">
                {f}
              </li>
            ))}
          </ul>
        )}
        {reason && <p className="mt-1 line-clamp-2 text-[12px] text-ivory/70">{reason}</p>}
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <p className="tnum text-[13px]">
            {fromPrice === null ? (
              <span className="font-semibold text-muted">No seats left</span>
            ) : fromPrice === 0 ? (
              <span className="font-bold">Free</span>
            ) : (
              <TicketPrice price={fromPrice} fee={fee ?? 0} currency={e.currency} from />
            )}
          </p>
          <span className="relative z-10 rounded-full border border-ivory/25 px-3 py-1.5 text-[12px] font-semibold group-hover:border-citron group-hover:text-citron" aria-hidden="true">
            View details
          </span>
        </div>
      </div>
    </article>
  );
}
