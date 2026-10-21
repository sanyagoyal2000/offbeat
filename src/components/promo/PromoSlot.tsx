import Image from "next/image";
import type { PromoPick } from "@/lib/server/experiments";

/** In-app promotional card. The official event name stays fixed; only the headline/body vary. */
export function PromoSlot({ promo }: { promo: PromoPick }) {
  return (
    <aside aria-label="Promoted event" className="overflow-hidden rounded-[24px] border border-citron/30 bg-gradient-to-br from-[#252812] to-card">
      <a href={`/api/promo/click?exp=${promo.experimentId}&v=${promo.variantId}&session=${promo.event.sessionId}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <Image src={promo.event.image} alt="" width={160} height={100} priority className="h-24 w-full flex-none rounded-[16px] object-cover sm:w-40" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Promoted by the organizer</p>
          <p className="mt-0.5 font-display text-[16px] leading-snug">{promo.headline}</p>
          <p className="mt-1 text-[13px] text-ivory/80">{promo.body}</p>
          <p className="tnum mt-1 text-[12px] text-muted">
            <span className="font-semibold text-ivory">{promo.event.title}</span> · {promo.event.when} · {promo.event.venue}
          </p>
        </div>
      </a>
    </aside>
  );
}
