import Image from "next/image";
import Link from "next/link";
import { formatDay, formatClock, formatMoney, nowIn } from "@/lib/tz";
import { currentUid } from "@/lib/server/identity";
import { listReservations } from "@/lib/server/reservations";

export default async function TicketsPage() {
  const all = await listReservations(await currentUid());
  const upcoming = all.filter((r) => r.status === "reserved" && r.end > nowIn(r.timezone));
  const past = all.filter((r) => !upcoming.includes(r)).reverse();
  const Row = ({ r }: { r: (typeof all)[number] }) => (
    <li>
      <Link href={`/tickets/${r.id}`} className="flex gap-4 rounded-[20px] border border-line bg-card p-3 hover:border-ivory/30">
        <Image src={r.image} alt="" width={96} height={72} className="h-[72px] w-24 flex-none rounded-[14px] object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[15px]">{r.eventTitle}</p>
          <p className="tnum text-[13px] text-ivory/80">{formatDay(r.start)} · {formatClock(r.start)} · {r.venue.name}</p>
          <p className="tnum text-[12px] text-muted">
            {r.seats?.length ? `${r.tierName} ${r.seats.join(", ")}` : `${r.quantity} × ${r.tierName}`} · {formatMoney(r.total, r.currency)} ·{" "}
            <span className={r.status === "cancelled" ? "text-muted" : "text-citron"}>{r.status === "cancelled" ? "Cancelled" : "Demo reservation"}</span>
          </p>
        </div>
      </Link>
    </li>
  );
  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 sm:px-6">
      <h1 className="font-display text-[24px]">Tickets</h1>
      <p className="mt-1 text-[13px] text-muted">Demo reservations made on this device. No payments have been taken.</p>
      {all.length === 0 ? (
        <div className="mt-6 rounded-[24px] border border-dashed border-ivory/20 p-6 text-center">
          <p className="text-[15px]">No reservations yet.</p>
          <Link href="/" className="mt-3 inline-flex h-11 items-center rounded-full bg-citron px-5 font-bold text-ink">Find something to do</Link>
        </div>
      ) : (
        <>
          <h2 className="mt-6 text-[15px] font-bold">Upcoming</h2>
          {upcoming.length ? <ul className="mt-2 flex flex-col gap-3">{upcoming.map((r) => <Row key={r.id} r={r} />)}</ul> : <p className="mt-2 text-[14px] text-muted">Nothing upcoming.</p>}
          {past.length > 0 && (
            <>
              <h2 className="mt-6 text-[15px] font-bold">Past and cancelled</h2>
              <ul className="mt-2 flex flex-col gap-3">{past.map((r) => <Row key={r.id} r={r} />)}</ul>
            </>
          )}
        </>
      )}
    </main>
  );
}
