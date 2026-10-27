"use client";

import { ReplanNotice } from "./ReplanNotice";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { SeatMap, bestAvailable, type SectionPrice } from "@/components/SeatMap";
import { LAYOUTS, sectionOf } from "@/lib/seating";
import type { BookingSession } from "@/lib/server/bookingData";
import { formatClock, formatDay, formatMoney } from "@/lib/tz";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Showtime → number of seats → seat map → review → confirm. Seats are rechecked on the server. */
export function SeatBookingFlow({
  event,
  layoutId,
  sessions: initialSessions,
  initialTaken,
  feeLabel,
  initialSessionId,
  initialQty,
  fromPlan = false,
}: {
  event: { id: string; title: string; currency: string; venue: string; isMovie: boolean };
  layoutId: string;
  sessions: BookingSession[];
  initialTaken: string[];
  feeLabel: string;
  initialSessionId?: string;
  initialQty: number;
  /** Opened from the planner: a sell-out offers to re-plan. */
  fromPlan?: boolean;
}) {
  const router = useRouter();
  const layout = LAYOUTS[layoutId];
  const [sessions, setSessions] = useState(initialSessions);
  const [sessionId, setSessionId] = useState((initialSessions.find((s) => s.id === initialSessionId) ?? initialSessions.find((s) => s.tiers.some((t) => t.left > 0)) ?? initialSessions[0])?.id ?? "");
  const session = sessions.find((s) => s.id === sessionId);
  const [taken, setTaken] = useState(new Set(initialTaken));
  const [qty, setQty] = useState(initialQty);
  const [seats, setSeats] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [step, setStep] = useState<"select" | "review">("select");
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soldOutSession, setSoldOutSession] = useState<string | null>(null);
  const idemKey = useRef("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [step]);

  const days = useMemo(() => [...new Set(sessions.map((s) => s.start.slice(0, 10)))].slice(0, 14), [sessions]);
  const [day, setDay] = useState(session?.start.slice(0, 10) ?? days[0]);
  const timesForDay = sessions.filter((s) => s.start.startsWith(day));

  const prices: SectionPrice[] = (session?.tiers ?? []).map((t) => ({ section: t.name, tierId: t.id, price: t.price, fee: t.fee, left: t.left }));
  const section = seats[0] ? sectionOf(layout, seats[0]) : null;
  const tier = session?.tiers.find((t) => t.name === section);
  const maxQty = Math.min(10, Math.max(0, ...prices.map((p) => p.left)));
  const cost = tier ? { subtotal: round2(tier.price * seats.length), fees: round2(tier.fee * seats.length), total: round2((tier.price + tier.fee) * seats.length) } : null;

  const loadSession = async (id: string) => {
    setSessionId(id);
    setSeats([]);
    setNote(null);
    setLoadingSeats(true);
    try {
      const res = await fetch(`/api/events/${event.id}/availability?session=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (res.ok) {
        const body = (await res.json()) as { sessions: BookingSession[]; taken: string[] };
        setSessions(body.sessions);
        setTaken(new Set(body.taken));
      }
    } finally {
      setLoadingSeats(false);
    }
  };

  const changeQty = (n: number) => {
    setQty(n);
    if (seats.length > n) setSeats(seats.slice(0, n));
  };

  const pickBest = (sec: string) => {
    const best = bestAvailable(layout, sec, qty, taken);
    if (best) {
      setSeats(best);
      setNote(`Picked ${best.join(", ")} in ${sec}.`);
    } else setNote(`No ${qty} seats together in ${sec}. Try fewer seats or another section.`);
  };

  const confirm = async () => {
    if (!tier || !session || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId: event.id, sessionId: session.id, tierId: tier.id, quantity: seats.length, seats, idempotencyKey: idemKey.current }),
      });
      const body = (await res.json()) as { reservation?: { id: string }; error?: string; code?: string };
      if (!res.ok || !body.reservation) {
        setSoldOutSession(body.code === "sold-out" || body.code === "insufficient" ? session.id : null);
        setError(body.error ?? "Couldn't reserve those seats.");
        await loadSession(session.id);
        setStep("select");
        return;
      }
      router.replace(`/tickets/${body.reservation.id}?new=1`);
    } catch {
      setError("Network problem. Nothing was reserved yet; try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!sessions.length) return <p className="mt-6 rounded-[20px] border border-dashed border-ivory/20 p-5 text-[14px] text-muted">No upcoming {event.isMovie ? "showtimes" : "performances"}.</p>;

  if (step === "review" && session && tier && cost)
    return (
      <section className="mt-5 rounded-[24px] border border-line bg-card p-5" aria-labelledby="rv">
        <h2 id="rv" ref={heading} tabIndex={-1} className="font-display text-[18px] focus:outline-none">Review your seats</h2>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[14px]">
          <dt className="text-muted">{event.isMovie ? "Showtime" : "Performance"}</dt>
          <dd className="tnum">{formatDay(session.start)} · {formatClock(session.start)} (local)</dd>
          <dt className="text-muted">Venue</dt>
          <dd>{event.venue}</dd>
          <dt className="text-muted">Seats</dt>
          <dd className="font-semibold">{tier.name}: {[...seats].sort((a, b) => a.localeCompare(b, "en", { numeric: true })).join(", ")}</dd>
        </dl>
        <dl className="tnum mt-4 border-t border-line pt-4 text-[14px]">
          <div className="flex justify-between"><dt>{seats.length} × {formatMoney(tier.price, event.currency)}</dt><dd>{formatMoney(cost.subtotal, event.currency)}</dd></div>
          <div className="mt-1 flex justify-between text-ivory/80"><dt>{feeLabel} ({seats.length} × {formatMoney(tier.fee, event.currency)})</dt><dd>{formatMoney(cost.fees, event.currency)}</dd></div>
          <div className="mt-3 flex justify-between text-[17px] font-bold"><dt>Total</dt><dd>{formatMoney(cost.total, event.currency)}</dd></div>
        </dl>
        <p className="mt-4 rounded-[16px] bg-raised p-3 text-[13px] text-ivory/85">Demo reservation: no payment is taken and the venue hasn&apos;t confirmed these seats. They are held in this app&apos;s sample seat map.</p>
        {error && <p role="alert" className="mt-3 text-[14px] font-semibold text-citron">{error}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <button type="button" onClick={() => setStep("select")} disabled={submitting} className="h-12 rounded-full border border-ivory/25 px-6 font-semibold">Change seats</button>
          <button type="button" onClick={confirm} disabled={submitting} className="h-12 flex-1 rounded-full bg-citron px-6 font-bold text-ink disabled:opacity-60">
            {submitting ? "Reserving…" : `Confirm demo reservation · ${formatMoney(cost.total, event.currency)}`}
          </button>
        </div>
      </section>
    );

  return (
    <div className="mt-5 flex flex-col gap-5">
      <h2 ref={heading} tabIndex={-1} className="sr-only">Choose seats</h2>
      {error && <p role="alert" className="rounded-[16px] border border-citron/40 p-3 text-[14px] text-citron">{error} The seat map has been refreshed.</p>}
      {fromPlan && soldOutSession && <ReplanNotice sessionId={soldOutSession} />}

      <section aria-labelledby="when-h">
        <h3 id="when-h" className="text-[15px] font-bold">1. {event.isMovie ? "Date and showtime" : "Date and time"}</h3>
        <div className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4" role="radiogroup" aria-label="Date">
          {days.map((d) => {
            const first = sessions.find((s) => s.start.startsWith(d))!;
            return (
              <button key={d} type="button" role="radio" aria-checked={d === day} onClick={() => setDay(d)} className={`flex h-14 w-16 flex-none flex-col items-center justify-center rounded-[14px] text-[12px] font-semibold ${d === day ? "bg-citron text-ink" : "border border-ivory/20"}`}>
                {formatDay(first.start).split(" ").map((p, i) => <span key={i} className={i === 1 ? "text-[16px] font-bold" : ""}>{p}</span>)}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Time">
          {timesForDay.map((s) => {
            const left = s.tiers.reduce((n, t) => n + t.left, 0);
            const cap = s.tiers.reduce((n, t) => n + t.capacity, 0);
            return (
              <button key={s.id} type="button" role="radio" aria-checked={s.id === sessionId} disabled={left === 0} onClick={() => loadSession(s.id)}
                className={`tnum h-11 rounded-full px-4 text-[14px] font-semibold disabled:opacity-40 ${s.id === sessionId ? "bg-citron text-ink" : left / cap < 0.1 ? "border border-citron/60 text-citron" : "border border-ivory/25"}`}
                aria-label={`${formatClock(s.start)}, ${left === 0 ? "sold out" : `${left} seats left`}`}>
                {formatClock(s.start)}
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="qty-h">
        <h3 id="qty-h" className="text-[15px] font-bold">2. How many seats?</h3>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Number of seats">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" role="radio" aria-checked={qty === n} disabled={n > maxQty} onClick={() => changeQty(n)} className={`tnum size-11 rounded-full text-[15px] font-bold disabled:opacity-30 ${qty === n ? "bg-citron text-ink" : "border border-ivory/20"}`}>
              {n}
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="seat-h" aria-busy={loadingSeats}>
        <h3 id="seat-h" className="text-[15px] font-bold">3. Pick {qty} seat{qty === 1 ? "" : "s"}</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {prices.filter((p) => p.left >= qty).map((p) => (
            <button key={p.section} type="button" onClick={() => pickBest(p.section)} className="h-10 rounded-full border border-ivory/25 px-3 text-[13px] font-semibold">Best available in {p.section}</button>
          ))}
        </div>
        <div className={`mt-3 ${loadingSeats ? "opacity-50" : ""}`}>
          <SeatMap layoutId={layoutId} taken={taken} prices={prices} quantity={qty} currency={event.currency} selected={seats} onChange={(s, n) => { setSeats(s); setNote(n ?? null); }} />
        </div>
        <p aria-live="polite" className="mt-2 min-h-5 text-[13px] text-citron">{note}</p>
      </section>

      <div className="sticky bottom-20 z-10 flex items-center justify-between gap-3 rounded-[20px] border border-line bg-card/95 p-4 backdrop-blur md:bottom-4">
        <p className="tnum text-[13px]">
          {cost ? <span className="block text-[16px] font-bold">{formatMoney(cost.total, event.currency)}</span> : <span className="block font-semibold">No seats selected</span>}
          <span className="text-muted">{seats.length}/{qty} selected{section ? ` · ${section}` : ""}</span>
        </p>
        <button type="button" disabled={seats.length !== qty || !tier} onClick={() => { idemKey.current = crypto.randomUUID(); setError(null); setStep("review"); }} className="h-12 rounded-full bg-citron px-6 font-bold text-ink disabled:opacity-40">
          Review
        </button>
      </div>
    </div>
  );
}
