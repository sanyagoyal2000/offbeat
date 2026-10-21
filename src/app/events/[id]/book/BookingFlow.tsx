"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { TicketPrice } from "@/components/TicketPrice";
import type { BookingSession } from "@/lib/server/bookingData";
import { formatClock, formatDay, formatMoney } from "@/lib/tz";

type Step = "select" | "review";
const round2 = (n: number) => Math.round(n * 100) / 100;

export function BookingFlow({
  event,
  sessions: initialSessions,
  feeLabel,
  initialSessionId,
  initialQty,
}: {
  event: { id: string; title: string; currency: string; timezone: string };
  sessions: BookingSession[];
  feeLabel: string;
  initialSessionId?: string;
  initialQty: number;
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState(initialSessions);
  const [sessionId, setSessionId] = useState(
    (initialSessions.find((s) => s.id === initialSessionId) ?? initialSessions.find((s) => s.tiers.some((t) => t.left > 0)) ?? initialSessions[0])?.id ?? "",
  );
  const session = sessions.find((s) => s.id === sessionId);
  const [tierId, setTierId] = useState<string>(() => [...(session?.tiers ?? [])].filter((t) => t.left > 0).sort((a, b) => a.price - b.price)[0]?.id ?? "");
  const tier = session?.tiers.find((t) => t.id === tierId);
  const [qty, setQty] = useState(initialQty);
  const [step, setStep] = useState<Step>("select");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per review: a double tap or retry can't create two reservations.
  const idemKey = useRef<string>("");
  const heading = useRef<HTMLHeadingElement>(null);

  const maxQty = Math.min(10, tier?.left ?? 0);
  useEffect(() => {
    if (qty > maxQty && maxQty > 0) setQty(maxQty);
  }, [maxQty, qty]);
  useEffect(() => heading.current?.focus(), [step]);

  const cost = useMemo(() => {
    if (!tier) return null;
    const subtotal = round2(tier.price * qty);
    const fees = round2(tier.fee * qty);
    return { subtotal, fees, total: round2(subtotal + fees) };
  }, [tier, qty]);

  const refresh = async () => {
    const res = await fetch(`/api/events/${event.id}/availability`, { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as { sessions: BookingSession[] };
    setSessions(body.sessions);
  };

  const chooseSession = (id: string) => {
    setSessionId(id);
    const s = sessions.find((x) => x.id === id);
    const cheapest = [...(s?.tiers ?? [])].filter((t) => t.left > 0).sort((a, b) => a.price - b.price)[0];
    setTierId(cheapest?.id ?? "");
    setError(null);
  };

  const toReview = () => {
    idemKey.current = crypto.randomUUID();
    setError(null);
    setStep("review");
  };

  const confirm = async () => {
    if (!tier || !session || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId: event.id, sessionId: session.id, tierId: tier.id, quantity: qty, idempotencyKey: idemKey.current }),
      });
      const body = (await res.json()) as { reservation?: { id: string }; error?: string };
      if (!res.ok || !body.reservation) {
        setError(body.error ?? "Couldn't reserve. Please try again.");
        await refresh();
        setStep("select");
        return;
      }
      router.replace(`/tickets/${body.reservation.id}?new=1`);
    } catch {
      setError("Network problem. Nothing was reserved yet; check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!sessions.length)
    return <p className="mt-6 rounded-[20px] border border-dashed border-ivory/20 p-5 text-[14px] text-muted">No upcoming dates are open for booking.</p>;

  if (step === "review" && session && tier && cost)
    return (
      <section className="mt-5 rounded-[24px] border border-line bg-card p-5" aria-labelledby="review-h">
        <h2 id="review-h" ref={heading} tabIndex={-1} className="font-display text-[18px] focus:outline-none">
          Review your reservation
        </h2>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[14px]">
          <dt className="text-muted">Date</dt>
          <dd className="tnum">{formatDay(session.start)} · {formatClock(session.start)} (local)</dd>
          <dt className="text-muted">Tickets</dt>
          <dd className="tnum">{qty} × {tier.name}</dd>
        </dl>
        <dl className="tnum mt-4 border-t border-line pt-4 text-[14px]">
          <div className="flex justify-between"><dt>Tickets ({qty} × {formatMoney(tier.price, event.currency)})</dt><dd>{formatMoney(cost.subtotal, event.currency)}</dd></div>
          <div className="mt-1 flex justify-between text-ivory/80"><dt>{feeLabel} ({qty} × {formatMoney(tier.fee, event.currency)})</dt><dd>{formatMoney(cost.fees, event.currency)}</dd></div>
          <div className="mt-3 flex justify-between text-[17px] font-bold"><dt>Total</dt><dd>{formatMoney(cost.total, event.currency)}</dd></div>
        </dl>
        <p className="mt-4 rounded-[16px] bg-raised p-3 text-[13px] text-ivory/85">
          This is a demo reservation. No payment is taken, nothing is charged, and the organizer hasn&apos;t confirmed a seat. It does count against this app&apos;s sample seat numbers.
        </p>
        {error && <p role="alert" className="mt-3 text-[14px] font-semibold text-citron">{error}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <button type="button" onClick={() => setStep("select")} disabled={submitting} className="h-12 rounded-full border border-ivory/25 px-6 font-semibold">
            Change selection
          </button>
          <button type="button" onClick={confirm} disabled={submitting} aria-disabled={submitting} className="h-12 flex-1 rounded-full bg-citron px-6 font-bold text-ink disabled:opacity-60">
            {submitting ? "Reserving…" : `Confirm demo reservation · ${formatMoney(cost.total, event.currency)}`}
          </button>
        </div>
      </section>
    );

  return (
    <div className="mt-5 flex flex-col gap-5">
      <h2 ref={heading} tabIndex={-1} className="sr-only">Choose tickets</h2>
      {error && <p role="alert" className="rounded-[16px] border border-citron/40 p-3 text-[14px] text-citron">{error} Availability has been refreshed.</p>}
      <section aria-labelledby="date-h">
        <h3 id="date-h" className="text-[15px] font-bold">1. Date</h3>
        <label className="sr-only" htmlFor="session">Session</label>
        <select id="session" value={sessionId} onChange={(e) => chooseSession(e.target.value)} className="mt-2 h-12 w-full rounded-[14px] border border-ivory/20 bg-card px-3 text-[15px]">
          {sessions.map((s) => {
            const left = s.tiers.reduce((n, t) => n + t.left, 0);
            return (
              <option key={s.id} value={s.id} disabled={left === 0}>
                {formatDay(s.start)} · {formatClock(s.start)} {left === 0 ? "(sold out)" : ""}
              </option>
            );
          })}
        </select>
      </section>

      <fieldset>
        <legend className="text-[15px] font-bold">2. Ticket type</legend>
        <div className="mt-2 flex flex-col gap-2">
          {session?.tiers.map((t) => (
            <label key={t.id} className={`flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-[14px] border px-4 py-2 ${t.left === 0 ? "cursor-not-allowed opacity-50" : tierId === t.id ? "border-citron bg-citron/10" : "border-ivory/15"}`}>
              <span className="flex items-center gap-3">
                <input type="radio" name="tier" value={t.id} checked={tierId === t.id} disabled={t.left === 0} onChange={() => setTierId(t.id)} className="size-5 accent-[var(--color-citron)]" />
                <span>
                  <span className="block text-[15px] font-semibold">{t.name}</span>
                  <span className="tnum block text-[12px] text-muted">{t.left === 0 ? "Sold out" : `${t.left} left`}</span>
                </span>
              </span>
              <span className="tnum text-right">
                <TicketPrice price={t.price} fee={t.fee} currency={event.currency} />
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={!tier || maxQty === 0}>
        <legend className="text-[15px] font-bold">3. Quantity</legend>
        <div className="mt-2 flex items-center gap-3">
          <button type="button" aria-label="One fewer ticket" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} className="size-12 rounded-full border border-ivory/20 text-[22px] disabled:opacity-30">−</button>
          <output aria-live="polite" className="tnum min-w-20 text-center text-[17px] font-bold">{qty} {qty === 1 ? "ticket" : "tickets"}</output>
          <button type="button" aria-label="One more ticket" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} disabled={qty >= maxQty} className="size-12 rounded-full border border-ivory/20 text-[22px] disabled:opacity-30">+</button>
        </div>
        <p className="mt-1 text-[12px] text-muted">Up to {Math.max(maxQty, 0)} for this ticket type (max 10 per order).</p>
      </fieldset>

      {cost && tier && (
        <div className="sticky bottom-20 z-10 flex items-center justify-between gap-3 rounded-[20px] border border-line bg-card/95 p-4 backdrop-blur md:bottom-4">
          <p className="tnum text-[13px]">
            <span className="block text-[16px] font-bold">{formatMoney(cost.total, event.currency)}</span>
            <span className="text-muted">{formatMoney(cost.subtotal, event.currency)} + {formatMoney(cost.fees, event.currency)} fees</span>
          </p>
          <button type="button" onClick={toReview} disabled={qty > maxQty || maxQty === 0} className="h-12 rounded-full bg-citron px-6 font-bold text-ink disabled:opacity-40">
            Review
          </button>
        </div>
      )}
    </div>
  );
}
