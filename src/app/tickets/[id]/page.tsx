import { notFound } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { cityById } from "@/lib/locations";
import { nowIn, zoneLabel } from "@/lib/tz";
import { currentUid } from "@/lib/server/identity";
import { getReservation } from "@/lib/server/reservations";
import { TicketView } from "./TicketView";

export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const r = await getReservation(await currentUid(), id);
  if (!r) notFound();
  return (
    <main className="mx-auto max-w-xl px-4 pt-4 sm:px-6">
      <BackLink href="/tickets" label="All tickets" />
      <TicketView
        reservation={r}
        justCreated={sp.new === "1"}
        cityName={cityById(r.cityId)?.name ?? ""}
        zone={zoneLabel(r.timezone, r.start)}
        isPast={r.end <= nowIn(r.timezone)}
      />
    </main>
  );
}
