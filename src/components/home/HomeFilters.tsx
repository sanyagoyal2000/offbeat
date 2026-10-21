"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type FormEvent } from "react";
import { CATEGORIES } from "@/lib/categories";
import { TIME_OF_DAY_LABEL, TIMES_OF_DAY, formatRange, inRange, pillRange, type DateRange, type DatePill, type TimeOfDay } from "@/lib/dateRange";
import { parseSearch } from "@/lib/searchParse";
import { formatMoney } from "@/lib/tz";
import { CalendarSheet } from "../CalendarSheet";
import { Dialog } from "../Dialog";
import { CalendarIcon, CloseIcon, SearchIcon, SlidersIcon } from "../icons";

export type FilterState = {
  kw: string[];
  category: string | null;
  range: DateRange | null;
  tonight: boolean;
  time: TimeOfDay;
  max: number | null;
  party: number;
  near: string | null;
  sort: "relevance" | "soonest" | "price";
};

const pill = (on: boolean) =>
  `tnum flex h-11 flex-none items-center gap-2 whitespace-nowrap rounded-full px-4 text-[14px] font-semibold transition-colors ${
    on ? "bg-citron text-ink" : "border border-ivory/15 bg-card text-ivory hover:border-ivory/40"
  }`;

function toQuery(f: FilterState): string {
  const p = new URLSearchParams();
  if (f.kw.length) p.set("kw", f.kw.join(" "));
  if (f.category) p.set("cat", f.category);
  if (f.tonight) p.set("tonight", "1");
  else if (f.range) {
    p.set("from", f.range.from);
    p.set("to", f.range.to);
  }
  if (f.time !== "any") p.set("time", f.time);
  if (f.max !== null) p.set("max", String(f.max));
  if (f.party > 1) p.set("party", String(f.party));
  if (f.near) p.set("near", f.near);
  p.set("sort", f.sort);
  return p.toString();
}

export function HomeFilters({
  state,
  today,
  currency,
  budgetPresets,
  hasInterests,
  calendarIndex,
}: {
  state: FilterState;
  today: string;
  currency: string;
  budgetPresets: number[];
  hasInterests: boolean;
  calendarIndex: { eventId: string; date: string; time: string }[];
}) {
  const router = useRouter();
  const [text, setText] = useState(state.kw.join(" "));
  const [calOpen, setCalOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [customMax, setCustomMax] = useState(state.max?.toString() ?? "");
  const [pending, setPending] = useState(false);

  const apply = useCallback(
    (next: Partial<FilterState>) => {
      setPending(true);
      router.push(`/?${toQuery({ ...state, ...next })}`, { scroll: false });
      setTimeout(() => setPending(false), 600);
    },
    [router, state],
  );

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseSearch(text, today);
    // Structured requirements become visible, removable chips; leftover words stay as keywords.
    apply({
      kw: parsed.keywords,
      category: parsed.category ?? state.category,
      range: parsed.range ?? state.range,
      tonight: parsed.dateLabel === "Tonight" ? true : parsed.range ? false : state.tonight,
      time: parsed.dateLabel === "Tonight" ? "any" : (parsed.timeOfDay ?? state.time),
      max: parsed.maxPrice ?? state.max,
      party: parsed.partySize ?? state.party,
      near: parsed.near ?? state.near,
    });
    setText(parsed.keywords.join(" "));
  };

  const datePills: [DatePill, string][] = [
    ["tomorrow", "Tomorrow"],
    ["weekend", "This weekend"],
    ["nextWeekend", "Next weekend"],
  ];
  const activePill = !state.tonight && state.range ? datePills.find(([k]) => {
    const r = pillRange(k, today);
    return r.from === state.range!.from && r.to === state.range!.to;
  })?.[0] : undefined;

  const chips: { key: string; label: string; clear: Partial<FilterState> }[] = [];
  if (state.kw.length) chips.push({ key: "kw", label: `“${state.kw.join(" ")}”`, clear: { kw: [] } });
  if (state.category) chips.push({ key: "cat", label: state.category, clear: { category: null } });
  if (state.tonight) chips.push({ key: "tonight", label: "Tonight (from 5 pm)", clear: { tonight: false } });
  else if (state.range) chips.push({ key: "range", label: formatRange(state.range), clear: { range: null } });
  if (state.time !== "any") chips.push({ key: "time", label: TIME_OF_DAY_LABEL[state.time], clear: { time: "any" } });
  if (state.max !== null) chips.push({ key: "max", label: state.max === 0 ? "Free only" : `Up to ${formatMoney(state.max, currency)} incl. fees`, clear: { max: null } });
  if (state.party > 1) chips.push({ key: "party", label: `${state.party} people`, clear: { party: 1 } });
  if (state.near) chips.push({ key: "near", label: `Near ${state.near}`, clear: { near: null } });

  const eventsOn = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const x of calendarIndex) m.set(x.date, (m.get(x.date) ?? new Set()).add(x.eventId));
    return m;
  }, [calendarIndex]);
  const eventsOnDay = useCallback((iso: string) => eventsOn.get(iso)?.size ?? 0, [eventsOn]);
  const countFor = useCallback(
    (r: DateRange | null, t: TimeOfDay) => {
      const ids = new Set<string>();
      for (const x of calendarIndex) {
        if (r && !inRange(x.date, r)) continue;
        if (t !== "any") {
          const h = Number(x.time.slice(0, 2));
          const bucket = h >= 5 && h < 12 ? "morning" : h >= 12 && h < 17 ? "afternoon" : h >= 17 && h < 21 ? "evening" : "late";
          if (bucket !== t) continue;
        }
        ids.add(x.eventId);
      }
      return ids.size;
    },
    [calendarIndex],
  );
  const closeCal = useCallback(() => setCalOpen(false), []);

  return (
    <div className="flex flex-col gap-3" aria-busy={pending}>
      <form onSubmit={onSearch} role="search" className="flex gap-2">
        <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full border border-ivory/15 bg-card px-4 focus-within:border-citron">
          <SearchIcon size={18} className="flex-none text-muted" />
          <span className="sr-only">Search events</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Try “pottery this Sunday under 1500”"
            className="min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-muted focus:outline-none"
          />
          {text && (
            <button type="button" aria-label="Clear search text" onClick={() => setText("")} className="flex size-8 items-center justify-center rounded-full hover:bg-raised">
              <CloseIcon size={14} />
            </button>
          )}
        </label>
        <button type="submit" className="h-12 flex-none rounded-full bg-citron px-5 text-[15px] font-bold text-ink">
          Search
        </button>
      </form>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Categories">
        <button type="button" aria-pressed={!state.category} onClick={() => apply({ category: null })} className={pill(!state.category)}>
          All
        </button>
        {CATEGORIES.map((c) => (
          <button key={c} type="button" aria-pressed={state.category === c} onClick={() => apply({ category: state.category === c ? null : c })} className={pill(state.category === c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Quick filters">
        <button type="button" aria-pressed={state.tonight} onClick={() => apply({ tonight: !state.tonight, range: null })} className={pill(state.tonight)}>
          Tonight
        </button>
        {datePills.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={activePill === k} onClick={() => apply({ tonight: false, range: activePill === k ? null : pillRange(k, today) })} className={pill(activePill === k)}>
            {label}
          </button>
        ))}
        <button type="button" aria-haspopup="dialog" onClick={() => setCalOpen(true)} className={pill(!!state.range && !activePill && !state.tonight)}>
          <CalendarIcon size={16} />
          {state.range && !activePill && !state.tonight ? formatRange(state.range) : "Dates"}
        </button>
        <button type="button" aria-haspopup="dialog" onClick={() => setBudgetOpen(true)} className={pill(state.max !== null)}>
          {state.max !== null ? (state.max === 0 ? "Free" : `≤ ${formatMoney(state.max, currency)}`) : "Budget"}
        </button>
        <button type="button" aria-haspopup="dialog" onClick={() => setMoreOpen(true)} className={pill(state.party > 1 || state.time !== "any")}>
          <SlidersIcon size={16} />
          More filters
        </button>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
          {chips.map((c) => (
            <span key={c.key} className="flex h-9 items-center gap-1 rounded-full bg-citron/15 pl-3 text-[13px] font-semibold text-citron">
              {c.label}
              <button type="button" aria-label={`Remove filter: ${c.label}`} onClick={() => apply(c.clear)} className="flex size-9 items-center justify-center rounded-full hover:bg-citron/20">
                <CloseIcon size={13} strokeWidth={2.6} />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => {
              setText("");
              apply({ kw: [], category: null, range: null, tonight: false, time: "any", max: null, party: 1, near: null });
            }}
            className="h-9 rounded-full px-3 text-[13px] font-semibold text-ivory underline underline-offset-4"
          >
            Clear all
          </button>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <label htmlFor="sort" className="text-[13px] text-muted">
          Sort
        </label>
        <select
          id="sort"
          value={state.sort}
          onChange={(e) => apply({ sort: e.target.value as FilterState["sort"] })}
          className="h-10 rounded-full border border-ivory/15 bg-card px-3 text-[13px] font-semibold"
        >
          <option value="relevance">{hasInterests ? "Best match for your interests" : "Best match (add interests)"}</option>
          <option value="soonest">Soonest</option>
          <option value="price">Lowest price</option>
        </select>
      </div>

      <CalendarSheet
        open={calOpen}
        today={today}
        initialRange={state.tonight ? null : state.range}
        initialTime={state.time}
        eventsOnDay={eventsOnDay}
        countFor={countFor}
        onClose={closeCal}
        onApply={(r, t) => {
          setCalOpen(false);
          apply({ range: r, time: t, tonight: false });
        }}
      />

      <Dialog open={budgetOpen} title="Budget per person" onClose={() => setBudgetOpen(false)}>
        <p className="text-[13px] text-muted">Includes the booking fee. Prices are in {currency} for this city.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" className={pill(state.max === 0)} onClick={() => (setBudgetOpen(false), apply({ max: 0 }))}>
            Free only
          </button>
          {budgetPresets.map((b) => (
            <button key={b} type="button" className={pill(state.max === b)} onClick={() => (setBudgetOpen(false), apply({ max: b }))}>
              Up to {formatMoney(b, currency)}
            </button>
          ))}
        </div>
        <form
          className="mt-4 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(customMax);
            if (Number.isFinite(n) && n >= 0) {
              setBudgetOpen(false);
              apply({ max: n });
            }
          }}
        >
          <label className="flex-1 text-[13px] font-semibold">
            Custom maximum ({currency})
            <input
              inputMode="decimal"
              value={customMax}
              onChange={(e) => setCustomMax(e.target.value.replace(/[^\d.]/g, ""))}
              className="mt-1 h-12 w-full rounded-[14px] border border-ivory/20 bg-ink px-4 text-[15px]"
            />
          </label>
          <button type="submit" className="h-12 rounded-full bg-citron px-5 font-bold text-ink">
            Apply
          </button>
        </form>
        {state.max !== null && (
          <button type="button" className="mt-3 h-11 text-[14px] font-semibold underline underline-offset-4" onClick={() => (setBudgetOpen(false), apply({ max: null }))}>
            Remove budget
          </button>
        )}
      </Dialog>

      <Dialog open={moreOpen} title="More filters" onClose={() => setMoreOpen(false)}>
        <fieldset>
          <legend className="text-[14px] font-semibold">Tickets needed together</legend>
          <div className="mt-2 flex items-center gap-3">
            <button type="button" aria-label="Fewer people" disabled={state.party <= 1} onClick={() => apply({ party: state.party - 1 })} className="size-11 rounded-full border border-ivory/20 text-[20px] disabled:opacity-30">
              −
            </button>
            <span className="tnum min-w-16 text-center text-[16px] font-bold" aria-live="polite">
              {state.party} {state.party === 1 ? "person" : "people"}
            </span>
            <button type="button" aria-label="More people" disabled={state.party >= 10} onClick={() => apply({ party: state.party + 1 })} className="size-11 rounded-full border border-ivory/20 text-[20px] disabled:opacity-30">
              +
            </button>
          </div>
          <p className="mt-1 text-[12px] text-muted">Hides sessions without enough seats left in one ticket type.</p>
        </fieldset>
        <fieldset className="mt-5">
          <legend className="text-[14px] font-semibold">Time of day</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {TIMES_OF_DAY.map((t) => (
              <button key={t} type="button" aria-pressed={state.time === t} onClick={() => apply({ time: t })} className={pill(state.time === t)}>
                {TIME_OF_DAY_LABEL[t]}
              </button>
            ))}
          </div>
        </fieldset>
      </Dialog>
    </div>
  );
}
