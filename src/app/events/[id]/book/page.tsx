import { notFound } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { bookingSessions, sessionSeats } from "@/lib/server/bookingData";
import { getEvent } from "@/lib/server/catalog";
import { BookingFlow } from "./BookingFlow";
import { SeatBookingFlow } from "./SeatBookingFlow";

export default async function BookPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const event = await getEvent(id);
  if (!event || event.status !== "published") notFound();
  const data = await bookingSessions(event);
  return (
    <main className="mx-auto max-w-3xl px-4 pt-4 sm:px-6">
      <BackLink href={`/events/${event.id}${sp.session ? `?session=${sp.session}` : ""}`} label="Event details" />
      <h1 className="font-display text-[22px] leading-tight">{event.title}</h1>
      <p className="text-[14px] text-muted">
        {event.venue.name} · {event.venue.area} · local time ({event.timezone}) · {event.currency}
      </p>
      {event.seatLayout ? (
        <SeatBookingFlow
          event={{ id: event.id, title: event.title, currency: event.currency, venue: `${event.venue.name}, ${event.venue.area}`, isMovie: event.category === "Movies" }}
          layoutId={event.seatLayout}
          sessions={data.sessions}
          initialTaken={await sessionSeats(event, (data.sessions.find((x) => x.id === sp.session) ?? data.sessions.find((x) => x.tiers.some((t) => t.left > 0)) ?? data.sessions[0])?.id ?? "")}
          feeLabel={data.feeLabel}
          initialSessionId={sp.session}
          initialQty={Math.min(10, Math.max(1, Number(sp.qty) || 2))}
        />
      ) : (
      <BookingFlow
        event={{ id: event.id, title: event.title, currency: event.currency, timezone: event.timezone }}
        sessions={data.sessions}
        feeLabel={data.feeLabel}
        initialSessionId={sp.session}
        initialQty={Math.min(10, Math.max(1, Number(sp.qty) || 1))}
      />
      )}
    </main>
  );
}
