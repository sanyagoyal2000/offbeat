"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  TIMES_OF_DAY,
  TIME_OF_DAY_LABEL,
  addDaysIso,
  addMonthsIso,
  longDay,
  monthGrid,
  monthStart,
  monthTitle,
  presetRange,
  rangeToSelection,
  selectDay,
  selectionToRange,
  type DateRange,
  type IsoDay,
  type Preset,
  type Selection,
  type TimeOfDay,
} from "@/lib/dateRange";
import { ChevronLeftIcon, CloseIcon } from "./icons";
import { primaryBtn, secondaryBtn } from "./ui";

const WEEKDAYS = [
  ["M", "Monday"],
  ["T", "Tuesday"],
  ["W", "Wednesday"],
  ["T", "Thursday"],
  ["F", "Friday"],
  ["S", "Saturday"],
  ["S", "Sunday"],
] as const;

const PRESETS: [Preset, string][] = [
  ["thisWeek", "This week"],
  ["next7", "Next 7 days"],
  ["thisMonth", "This month"],
  ["nextMonth", "Next month"],
];

const SWIPE_PX = 50;

export function CalendarSheet({
  open,
  today,
  initialRange,
  initialTime,
  eventsOnDay,
  countFor,
  onApply,
  onClose,
}: {
  open: boolean;
  today: IsoDay;
  initialRange: DateRange | null;
  initialTime: TimeOfDay;
  /** Matching events on a day (current location, taste and price filters). Drives dots and labels. */
  eventsOnDay: (iso: IsoDay) => number;
  /** Matching events for a candidate range + time of day. Drives the live button count. */
  countFor: (range: DateRange | null, time: TimeOfDay) => number;
  onApply: (range: DateRange | null, time: TimeOfDay) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const [sel, setSel] = useState<Selection>(rangeToSelection(initialRange));
  const [time, setTime] = useState<TimeOfDay>(initialTime);
  const [month, setMonth] = useState<IsoDay>(monthStart(initialRange?.from ?? today));
  const [focusDay, setFocusDay] = useState<IsoDay>(initialRange?.from ?? today);
  const gridRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const moveFocus = useRef(false);
  const swipeX = useRef<number | null>(null);

  // Re-sync with the applied filter every time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setSel(rangeToSelection(initialRange));
    setTime(initialTime);
    setMonth(monthStart(initialRange?.from ?? today));
    setFocusDay(initialRange?.from ?? today);
    closeRef.current?.focus();
  }, [open, initialRange, initialTime, today]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  // After keyboard navigation, move DOM focus to the newly focused day.
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`)?.focus();
  }, [focusDay, month]);

  const weeks = useMemo(() => monthGrid(month), [month]);
  const range = selectionToRange(sel);
  const count = countFor(range, time);
  const canGoBack = month > monthStart(today);
  const focusInMonth = focusDay.slice(0, 7) === month.slice(0, 7) ? focusDay : weeks.flat().find((d) => d && d >= today) ?? month;

  if (!open) return null;

  const goMonth = (n: number) => {
    if (n < 0 && !canGoBack) return;
    setMonth((m) => addMonthsIso(m, n));
  };

  const onDayKey = (e: KeyboardEvent<HTMLButtonElement>, iso: IsoDay) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const next = addDaysIso(iso, step);
    moveFocus.current = true;
    setFocusDay(next);
    if (next.slice(0, 7) !== month.slice(0, 7)) setMonth(monthStart(next));
  };

  const onPointerDown = (e: PointerEvent) => (swipeX.current = e.clientX);
  const onPointerUp = (e: PointerEvent) => {
    if (swipeX.current === null) return;
    const dx = e.clientX - swipeX.current;
    swipeX.current = null;
    if (Math.abs(dx) > SWIPE_PX) goMonth(dx < 0 ? 1 : -1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button type="button" aria-label="Close calendar" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-ink/75 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="sheet-in relative flex max-h-[92dvh] w-full max-w-[430px] flex-col overflow-y-auto rounded-t-[28px] border-t border-line bg-card px-5 pb-6 pt-3"
      >
        <span className="mx-auto mb-2 h-1 w-10 flex-none rounded-full bg-ivory/20" aria-hidden="true" />
        <header className="flex items-center justify-between">
          <h2 id={titleId} className="font-display text-[18px]">
            Pick dates
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-full bg-raised text-ivory hover:text-citron"
          >
            <CloseIcon size={18} />
          </button>
        </header>

        <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5" role="group" aria-label="Quick ranges">
          {PRESETS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                const r = presetRange(key, today);
                setSel(rangeToSelection(r));
                setMonth(monthStart(r.from));
                setFocusDay(r.from);
              }}
              className="flex h-11 flex-none items-center rounded-full border border-ivory/20 px-4 text-[13px] font-semibold hover:border-ivory/50"
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => goMonth(-1)}
            disabled={!canGoBack}
            className="flex size-11 items-center justify-center rounded-full bg-raised disabled:opacity-30"
          >
            <ChevronLeftIcon size={20} />
          </button>
          <p className="font-display text-[15px]" aria-live="polite">
            {monthTitle(month)}
          </p>
          <button type="button" aria-label="Next month" onClick={() => goMonth(1)} className="flex size-11 items-center justify-center rounded-full bg-raised">
            <ChevronLeftIcon size={20} className="rotate-180" />
          </button>
        </div>

        <div
          ref={gridRef}
          role="grid"
          aria-label={monthTitle(month)}
          className="mt-3 touch-pan-y select-none"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
        >
          <div role="row" className="grid grid-cols-7">
            {WEEKDAYS.map(([short, full], i) => (
              <span key={i} role="columnheader" aria-label={full} className="py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
                {short}
              </span>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} role="row" className="grid grid-cols-7">
              {week.map((iso, di) => {
                if (!iso) return <span key={di} role="gridcell" aria-hidden="true" />;
                const past = iso < today;
                const n = past ? 0 : eventsOnDay(iso);
                const isStart = range?.from === iso;
                const isEnd = range?.to === iso;
                const between = range && iso > range.from && iso < range.to;
                const edge = isStart || isEnd;
                const label = `${longDay(iso)}${past ? ", unavailable" : `, ${n === 0 ? "no events" : `${n} event${n === 1 ? "" : "s"}`}`}`;
                return (
                  <div key={iso} role="gridcell" aria-selected={!!(edge || between)} className="relative flex h-12 items-center justify-center">
                    {/* Range band: full width between, half width at the ends so it joins the circles. */}
                    {range && range.from !== range.to && (between || edge) && (
                      <span
                        aria-hidden="true"
                        className={`absolute inset-y-1 bg-citron/20 ${isStart ? "left-1/2 right-0" : isEnd ? "left-0 right-1/2" : "inset-x-0"} ${di === 0 && !isStart ? "rounded-l-full" : ""} ${di === 6 && !isEnd ? "rounded-r-full" : ""}`}
                      />
                    )}
                    <button
                      type="button"
                      data-day={iso}
                      tabIndex={iso === focusInMonth ? 0 : -1}
                      aria-label={label}
                      aria-disabled={past || undefined}
                      onClick={() => !past && setSel((s) => selectDay(s, iso))}
                      onKeyDown={(e) => onDayKey(e, iso)}
                      onFocus={() => setFocusDay(iso)}
                      className={`tnum relative flex size-11 flex-col items-center justify-center rounded-full text-[14px] font-semibold transition-colors ${
                        past
                          ? "cursor-not-allowed text-ivory/25"
                          : edge
                            ? "bg-citron text-ink"
                            : iso === today
                              ? "text-citron ring-1 ring-inset ring-citron/50 hover:bg-raised"
                              : "text-ivory hover:bg-raised"
                      }`}
                    >
                      {Number(iso.slice(8))}
                      {n > 0 && <span aria-hidden="true" className={`absolute bottom-1.5 size-1 rounded-full ${edge ? "bg-ink" : "bg-citron"}`} />}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5" role="radiogroup" aria-label="Time of day">
          {TIMES_OF_DAY.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={time === t}
              onClick={() => setTime(t)}
              className={`flex h-11 flex-none items-center rounded-full px-4 text-[13px] font-semibold transition-colors ${
                time === t ? "bg-ivory text-ink" : "border border-ivory/20 text-ivory"
              }`}
            >
              {TIME_OF_DAY_LABEL[t]}
            </button>
          ))}
        </div>

        <p className="mt-3 min-h-5 text-center text-[13px] text-muted" aria-live="polite">
          {count === 0 ? "No events in these dates, try widening the range" : ""}
        </p>

        <div className="mt-2 flex gap-3">
          <button
            type="button"
            onClick={() => {
              setSel({ start: null, end: null });
              setTime("any");
            }}
            className={`${secondaryBtn} flex-none`}
          >
            Reset
          </button>
          <button
            type="button"
            disabled={count === 0}
            onClick={() => onApply(range, time)}
            className={`${primaryBtn} tnum flex-1 disabled:cursor-not-allowed disabled:opacity-40`}
          >
            Show {count} event{count === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}
