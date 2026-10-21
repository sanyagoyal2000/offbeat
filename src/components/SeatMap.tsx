"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { LAYOUTS, sectionOf, seatId, type Layout } from "@/lib/seating";
import { formatMoney } from "@/lib/tz";
import { TicketPrice } from "./TicketPrice";

export type SectionPrice = { section: string; tierId: string; price: number; fee: number; left: number };

/** Best available: N adjacent free seats in one block (between aisles), preferring central rows and seats. */
export function bestAvailable(layout: Layout, section: string, n: number, taken: Set<string>): string[] | null {
  const rows = layout.rows.filter((r) => r.section === section);
  const midRow = (rows.length - 1) / 2;
  let best: { seats: string[]; score: number } | null = null;
  rows.forEach((r, ri) => {
    const cuts = [0, ...(r.aisles ?? []), r.seats];
    for (let b = 0; b < cuts.length - 1; b++) {
      for (let start = cuts[b] + 1; start + n - 1 <= cuts[b + 1]; start++) {
        const seats = Array.from({ length: n }, (_, i) => seatId(r.row, start + i));
        if (seats.some((s) => taken.has(s))) continue;
        const centre = Math.abs(start + (n - 1) / 2 - (r.seats + 1) / 2);
        const score = Math.abs(ri - midRow) * 3 + centre;
        if (!best || score < best.score) best = { seats, score };
      }
    }
  });
  return (best as { seats: string[] } | null)?.seats ?? null;
}

export function SeatMap({
  layoutId,
  taken,
  prices,
  quantity,
  currency,
  selected,
  onChange,
}: {
  layoutId: string;
  taken: Set<string>;
  prices: SectionPrice[];
  quantity: number;
  currency: string;
  selected: string[];
  onChange: (seats: string[], note?: string) => void;
}) {
  const layout = LAYOUTS[layoutId];
  const [focus, setFocus] = useState<string>(() => seatId(layout.rows[Math.floor(layout.rows.length / 2)].row, 1));
  const grid = useRef<HTMLDivElement>(null);
  const priceOf = useMemo(() => new Map(prices.map((p) => [p.section, p])), [prices]);
  const maxSeats = Math.max(...layout.rows.map((r) => r.seats));

  const toggle = (seat: string) => {
    if (taken.has(seat)) return;
    const section = sectionOf(layout, seat)!;
    if (selected.includes(seat)) return onChange(selected.filter((s) => s !== seat));
    const current = selected[0] ? sectionOf(layout, selected[0]) : null;
    if (current && current !== section) return onChange([seat], `Switched to ${section}. One booking can only include one section.`);
    if (selected.length >= quantity) return onChange([...selected.slice(1), seat]);
    onChange([...selected, seat]);
  };

  const move = (e: KeyboardEvent<HTMLButtonElement>, seat: string) => {
    const m = seat.match(/^([A-Z])(\d+)$/)!;
    const ri = layout.rows.findIndex((r) => r.row === m[1]);
    let r = ri;
    let n = Number(m[2]);
    if (e.key === "ArrowLeft") n--;
    else if (e.key === "ArrowRight") n++;
    else if (e.key === "ArrowUp") r--;
    else if (e.key === "ArrowDown") r++;
    else return;
    e.preventDefault();
    r = Math.max(0, Math.min(layout.rows.length - 1, r));
    n = Math.max(1, Math.min(layout.rows[r].seats, n));
    const next = seatId(layout.rows[r].row, n);
    setFocus(next);
    grid.current?.querySelector<HTMLButtonElement>(`[data-seat="${next}"]`)?.focus();
  };

  // Front row (A) sits next to the screen/stage at the bottom, so draw rows back-to-front.
  const drawn = [...layout.rows].reverse();
  let lastSection = "";
  return (
    <div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]" aria-label="Sections and prices">
        {prices.map((p) => (
          <li key={p.section} className="tnum">
            <span className="font-semibold">{p.section}</span>
            <TicketPrice price={p.price} fee={p.fee} currency={currency} />
            <span className="text-muted"> · {p.left} left</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-4 text-[12px] text-muted" aria-hidden="true">
        <span className="flex items-center gap-1.5"><span className="size-4 rounded-[5px] border border-ivory/40" /> Available</span>
        <span className="flex items-center gap-1.5"><span className="size-4 rounded-[5px] bg-citron" /> Selected</span>
        <span className="flex items-center gap-1.5"><span className="size-4 rounded-[5px] bg-raised" /> Taken</span>
      </div>
      <div className="no-scrollbar mt-3 overflow-x-auto rounded-[18px] border border-line bg-ink p-3">
        <div ref={grid} role="grid" aria-label={`Seat map, ${layout.label}. Arrow keys move, Enter selects.`} className="mx-auto w-max">
          {drawn.map((r, idx) => {
            const header = r.section !== lastSection;
            lastSection = r.section;
            const p = priceOf.get(r.section);
            return (
              <div key={r.row}>
                {header && (
                  <p className={`tnum pb-1 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-muted ${idx > 0 ? "pt-3" : ""}`}>
                    {r.section}
                    {p ? ` · ${formatMoney(Math.round((p.price + p.fee) * 100) / 100, currency)}` : ""}
                  </p>
                )}
                <div role="row" className="flex items-center gap-1 py-0.5">
                  <span className="w-5 text-center text-[11px] font-semibold text-muted" aria-hidden="true">{r.row}</span>
                  <div className="flex gap-1" style={{ minWidth: `${maxSeats * 34}px`, justifyContent: "center" }}>
                    {Array.from({ length: r.seats }, (_, i) => {
                      const n = i + 1;
                      const id = seatId(r.row, n);
                      const isTaken = taken.has(id);
                      const isSel = selected.includes(id);
                      return (
                        <span key={id} role="gridcell" className={`flex ${r.aisles?.includes(i) ? "ml-3" : ""}`}>
                          <button
                            type="button"
                            data-seat={id}
                            tabIndex={id === focus ? 0 : -1}
                            aria-pressed={isSel}
                            aria-disabled={isTaken || undefined}
                            aria-label={`Row ${r.row}, seat ${n}, ${r.section}${p ? `, ${formatMoney(Math.round((p.price + p.fee) * 100) / 100, currency)}` : ""}, ${isTaken ? "taken" : isSel ? "selected" : "available"}`}
                            onClick={() => toggle(id)}
                            onKeyDown={(e) => move(e, id)}
                            onFocus={() => setFocus(id)}
                            className={`tnum size-[30px] rounded-[7px] text-[10px] font-semibold transition-colors ${
                              isTaken ? "cursor-not-allowed bg-raised text-transparent" : isSel ? "bg-citron text-ink" : "border border-ivory/40 text-ivory/70 hover:border-citron hover:text-citron"
                            }`}
                          >
                            {n}
                          </button>
                        </span>
                      );
                    })}
                  </div>
                  <span className="w-5 text-center text-[11px] font-semibold text-muted" aria-hidden="true">{r.row}</span>
                </div>
              </div>
            );
          })}
          <div className="mx-auto mt-4 h-1.5 w-2/3 rounded-full bg-ivory/30" aria-hidden="true" />
          <p className="mt-1 text-center text-[11px] uppercase tracking-[0.12em] text-muted">{layout.stageLabel}</p>
        </div>
      </div>
    </div>
  );
}
