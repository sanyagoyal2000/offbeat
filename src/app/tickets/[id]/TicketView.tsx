"use client";

import { toPng } from "html-to-image";
import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { DoodleStar } from "@/components/Doodles";
import { DownloadIcon, QrIcon } from "@/components/icons";
import type { Reservation } from "@/lib/server/reservations";
import { formatClock, formatDay, formatMoney } from "@/lib/tz";

/** Visual-only barcode derived from the reservation id. */
function Barcode({ seed }: { seed: string }) {
  const bars: { x: number; w: number }[] = [];
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let x = 0;
  while (x < 290) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const w = 1 + (Math.abs(h) % 4);
    bars.push({ x, w });
    x += w + 1 + (Math.abs(h >> 3) % 3);
  }
  return (
    <svg viewBox="0 0 290 44" className="h-11 w-full" preserveAspectRatio="none" aria-hidden="true">
      {bars.map((b) => <rect key={b.x} x={b.x} width={b.w} height="44" fill="#10110F" />)}
    </svg>
  );
}

export function TicketView({ reservation: initial, justCreated, cityName, zone, isPast }: { reservation: Reservation; justCreated: boolean; cityName: string; zone: string; isPast: boolean }) {
  const [r, setR] = useState(initial);
  const ref = useRef<HTMLDivElement>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const cancelled = r.status === "cancelled";

  useEffect(() => {
    QRCode.toDataURL(`OFFBEAT-DEMO-RESERVATION:${r.id}`, { margin: 1, width: 480, color: { dark: "#10110F", light: "#F6F4EC" } }).then(setQr);
  }, [r.id]);

  const save = async () => {
    if (!ref.current) return;
    try {
      const url = await toPng(ref.current, { pixelRatio: 2, backgroundColor: "#10110F" });
      const a = document.createElement("a");
      a.href = url;
      a.download = `offbeat-demo-reservation-${r.id}.png`;
      a.click();
    } catch {
      setMsg("Couldn't create the image. Try a screenshot instead.");
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/reservations/${r.id}`, { method: "DELETE" });
      const body = (await res.json()) as { reservation?: Reservation; error?: string };
      if (!res.ok || !body.reservation) throw new Error(body.error);
      setR(body.reservation);
      setConfirmCancel(false);
      setMsg("Reservation cancelled. The seats are available to others again.");
    } catch (e) {
      setMsg((e as Error).message || "Couldn't cancel. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {justCreated && !cancelled && (
        <div role="status" className="rounded-[20px] bg-citron p-4 text-ink">
          <p className="font-display text-[16px]">Demo reservation confirmed</p>
          <p className="mt-1 text-[13px]">Saved to your Tickets. No payment was taken and the organizer hasn&apos;t confirmed a seat. Refreshing this page is safe.</p>
        </div>
      )}
      <div ref={ref} className={`rounded-[30px] bg-card p-2.5 ${cancelled ? "opacity-60" : ""}`}>
        <div className="relative h-[170px] overflow-hidden rounded-[22px]">
          <Image src={r.image} alt="" fill sizes="480px" className="object-cover" />
          <DoodleStar size={26} className="absolute left-4 top-4" />
        </div>
        <div className="relative mt-2.5 rounded-[22px] bg-citron px-5 pb-5 pt-5 text-ink">
          <span className="absolute -left-5 top-[96px] size-7 rounded-full bg-card" aria-hidden="true" />
          <span className="absolute -right-5 top-[96px] size-7 rounded-full bg-card" aria-hidden="true" />
          <h1 className="text-center font-display text-[19px] leading-tight">{r.eventTitle}</h1>
          <p className="mt-1 text-center text-[14px] text-ink/75">{r.venue.name}, {r.venue.area}{cityName ? `, ${cityName}` : ""}</p>
          <div className="my-4 border-t-2 border-dashed border-ink/30" />
          <dl className="grid grid-cols-2 gap-3">
            {[
              ["Date", formatDay(r.start)],
              ["Starts", `${formatClock(r.start)} ${zone}`],
              r.seats?.length ? ["Seats", `${r.tierName} ${r.seats.join(", ")}`] : ["Tickets", `${r.quantity} × ${r.tierName}`],
              ["Total (demo)", formatMoney(r.total, r.currency)],
            ].map(([k, v], i) => (
              <div key={k} className={i % 2 ? "text-right" : ""}>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink/60">{k}</dt>
                <dd className="tnum text-[16px] font-bold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="tnum mt-3 text-[11px] text-ink/70">
            {formatMoney(r.subtotal, r.currency)} tickets + {formatMoney(r.fees, r.currency)} {r.feeLabel}. Not charged.
          </p>
          <div className="my-4 border-t-2 border-dashed border-ink/30" />
          <Barcode seed={r.id} />
          <p className="mt-2 text-center text-[11px] font-semibold text-ink/70">
            Status: {cancelled ? "Cancelled" : "Demo reservation, not valid for entry"} · #{r.id}
          </p>
        </div>
      </div>

      {msg && <p role="status" className="text-[14px] text-citron">{msg}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-citron px-5 font-bold text-ink">
          <DownloadIcon size={18} /> Save image
        </button>
        <button type="button" onClick={() => setQrOpen(true)} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-ivory px-5 font-bold text-ink">
          <QrIcon size={18} /> QR code
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={`/events/${r.eventId}?session=${r.sessionId}`} className="flex h-11 items-center rounded-full border border-ivory/25 px-4 text-[14px] font-semibold">
          Event details
        </Link>
        {!cancelled && !isPast && (
          <button type="button" onClick={() => setConfirmCancel(true)} className="h-11 rounded-full border border-ivory/25 px-4 text-[14px] font-semibold">
            Cancel reservation
          </button>
        )}
      </div>

      <Dialog open={qrOpen} title={`Reservation #${r.id}`} onClose={() => setQrOpen(false)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
        {qr && <img src={qr} alt={`QR code containing reservation id ${r.id}`} className="mx-auto w-full max-w-[300px] rounded-[16px]" />}
        <p className="mt-3 text-center text-[13px] text-muted">This QR only contains the reservation id. It isn&apos;t a verified admission ticket.</p>
      </Dialog>
      <Dialog
        open={confirmCancel}
        title="Cancel this reservation?"
        onClose={() => setConfirmCancel(false)}
        footer={
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirmCancel(false)} className="h-12 flex-1 rounded-full border border-ivory/25 font-semibold">Keep it</button>
            <button type="button" onClick={cancel} disabled={busy} className="h-12 flex-1 rounded-full bg-citron font-bold text-ink">{busy ? "Cancelling…" : "Cancel reservation"}</button>
          </div>
        }
      >
        <p className="text-[14px] text-ivory/85">The {r.quantity} seat{r.quantity > 1 ? "s" : ""} go back to the sample inventory. Nothing was charged, so there&apos;s nothing to refund.</p>
      </Dialog>
    </div>
  );
}
