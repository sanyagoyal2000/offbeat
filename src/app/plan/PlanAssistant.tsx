"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { CATEGORIES, type Category } from "@/lib/categories";
import { parseSearch } from "@/lib/searchParse";
import { formatDayTime, formatMoney, formatClock } from "@/lib/tz";

type Area = { name: string; lat: number; lng: number };
type Option = {
  event: { id: string; title: string; category: string; image: string; venue: { name: string; area: string }; currency: string; summary: string };
  sessionId: string;
  start: string;
  end: string;
  tier: { id: string; name: string };
  ticketPrice: number;
  feePerTicket: number;
  bookingTotal: number;
  dinner: { restaurant: { id: string; name: string; area: string }; start: string; walkM: number; estimate: number } | null;
  perPerson: number;
  total: number;
  distanceKm: number | null;
  labels: string[];
  tradeoffs: string[];
  checks: { label: string; ok: boolean; detail: string }[];
  reason: string | null;
};
type Result = { options: Option[]; feasibleCount: number; blockers: { constraint: string; count: number; suggestion: string }[]; considered: number; tasteUsed: boolean };

type Form = {
  from: string;
  to: string;
  earliest: string;
  latest: string;
  area: string;
  maxKm: string;
  budget: string;
  mode: "per-person" | "total";
  party: number;
  categories: Category[];
  keywords: string;
  dinner: boolean;
};

type Revision = {
  maxPerPerson?: number | null;
  startBefore?: string | null;
  startAfter?: string | null;
  excludeCategories?: Category[];
  excludeEventIds?: string[];
  excludeRestaurantIds?: string[];
  pinSessionId?: string | null;
  simulatedSoldOut?: string[];
  maxKmOverride?: number | null;
  dinnerOverride?: boolean;
};

const input = "mt-1 h-11 w-full rounded-[12px] border border-ivory/20 bg-ink px-3 text-[14px]";

const LAST_PLAN = "ob_last_plan";

/** Saves one option as a plan (prices are recomputed on the server). */
function SavePlanButton({ o, party, saved, onSaved }: { o: Option; party: number; saved: boolean; onSaved: () => void }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  return (
    <button
      type="button"
      aria-pressed={saved}
      disabled={saved || state === "busy"}
      onClick={async () => {
        setState("busy");
        const res = await fetch("/api/plans", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ eventId: o.event.id, sessionId: o.sessionId, tierId: o.tier.id, party, dinner: o.dinner ? { restaurantId: o.dinner.restaurant.id, start: o.dinner.start } : null }),
        }).catch(() => null);
        if (res?.ok) {
          setState("idle");
          onSaved();
        } else setState("error");
      }}
      className={`flex h-10 items-center rounded-full px-4 text-[13px] font-semibold ${saved ? "border border-citron text-citron" : "border border-ivory/25"}`}
    >
      {saved ? "Saved to your plans" : state === "busy" ? "Saving…" : state === "error" ? "Couldn't save, retry" : "Save plan"}
    </button>
  );
}

export function PlanAssistant({ city, today, areas, hasInventory, prefill, replanSession, savedSessionIds = [] }: { city: { id: string; name: string; currency: string }; today: string; areas: Area[]; hasInventory: boolean; prefill: { from?: string; to?: string }; replanSession?: string; savedSessionIds?: string[] }) {
  const router = useRouter();
  const [savedPlans, setSavedPlans] = useState(() => new Set(savedSessionIds));
  const [f, setF] = useState<Form>({ from: prefill.from ?? "", to: prefill.to ?? "", earliest: "", latest: "", area: "", maxKm: "", budget: "", mode: "per-person", party: 1, categories: [], keywords: "", dinner: false });
  const [describe, setDescribe] = useState("");
  const [rev, setRev] = useState<Revision>({});
  const [history, setHistory] = useState<string[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [prev, setPrev] = useState<Option[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const formError = !f.from || !f.to ? "Choose the dates you're free." : f.from > f.to ? "The end date is before the start date." : f.from < today ? "Dates can't be in the past." : null;

  const run = async (revision: Revision, note?: string) => {
    if (formError) return setError(formError);
    setError(null);
    setState("loading");
    const area = areas.find((a) => a.name === f.area) ?? null;
    const body = {
      cityId: city.id,
      from: f.from,
      to: f.to,
      earliest: f.earliest || null,
      latest: f.latest || null,
      area,
      maxKm: revision.maxKmOverride ?? (area && f.maxKm ? Number(f.maxKm) : null),
      budget: { amount: f.budget ? Number(f.budget) : null, mode: f.mode },
      party: f.party,
      categories: f.categories,
      keywords: f.keywords.split(/\s+/).filter(Boolean).slice(0, 6),
      dinner: revision.dinnerOverride ?? f.dinner,
      ...revision,
    };
    try {
      const res = await fetch("/api/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't plan right now.");
      setPrev(result?.options ?? null);
      setResult(json);
      setRev(revision);
      if (note) setHistory((h) => [...h, note]);
      try {
        sessionStorage.setItem(LAST_PLAN, JSON.stringify({ cityId: city.id, f, rev: revision }));
      } catch {}
      setState("idle");
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  };

  // A booking from this plan sold out (real, not simulated): restore the last plan and run it again.
  // The planner reads live sold counts, so the sold-out option drops out by itself.
  const [pendingReplan, setPendingReplan] = useState<Revision | null>(null);
  useEffect(() => {
    if (!replanSession) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(LAST_PLAN) ?? "null") as { cityId: string; f: Form; rev: Revision } | null;
      if (saved && saved.cityId === city.id) {
        setF(saved.f);
        setPendingReplan({ ...saved.rev, pinSessionId: null });
      }
    } catch {}
  }, [replanSession, city.id]);
  useEffect(() => {
    if (!pendingReplan) return;
    setPendingReplan(null);
    run(pendingReplan, "Your pick sold out while you were booking, so this plan uses live availability");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingReplan]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setHistory([]);
    setPrev(null);
    run({});
  };

  const fillFromText = () => {
    const p = parseSearch(describe, today);
    setF((x) => ({
      ...x,
      from: p.range?.from ?? x.from,
      to: p.range?.to ?? x.to,
      earliest: p.timeOfDay === "evening" ? "17:00" : p.timeOfDay === "morning" ? "05:00" : p.timeOfDay === "afternoon" ? "12:00" : p.timeOfDay === "late" ? "21:00" : x.earliest,
      latest: p.timeOfDay === "evening" ? "20:59" : p.timeOfDay === "morning" ? "11:59" : p.timeOfDay === "afternoon" ? "16:59" : x.latest,
      budget: p.maxPrice !== undefined ? String(p.maxPrice) : x.budget,
      party: p.partySize ?? x.party,
      categories: p.category ? [p.category] : x.categories,
      keywords: p.keywords.join(" ") || x.keywords,
      area: p.near ? (areas.find((a) => a.name.toLowerCase().includes(p.near!.toLowerCase()))?.name ?? x.area) : x.area,
    }));
  };

  const revise = (o: Option, kind: string) => {
    const base: Revision = { ...rev, pinSessionId: null, simulatedSoldOut: rev.simulatedSoldOut };
    switch (kind) {
      case "cheaper":
        return run({ ...base, maxPerPerson: o.perPerson - 0.01 }, `Cheaper than ${formatMoney(o.perPerson, city.currency)} per person`);
      case "closer":
        return run({ ...base, maxKmOverride: Math.max(0.1, (o.distanceKm ?? 0) - 0.1) }, `Closer than ${o.distanceKm?.toFixed(1)} km`);
      case "earlier":
        return run({ ...base, startBefore: o.start }, `Starting before ${formatDayTime(o.start)}`);
      case "later":
        return run({ ...base, startAfter: o.start }, `Starting after ${formatDayTime(o.start)}`);
      case "different":
        return run({ ...base, excludeCategories: [...(rev.excludeCategories ?? []), o.event.category as Category] }, `Not ${o.event.category}`);
      case "nodinner":
        return run({ ...base, dinnerOverride: false }, "Without dinner");
      case "replace-event":
        return run({ ...base, excludeEventIds: [...(rev.excludeEventIds ?? []), o.event.id] }, `Replace ${o.event.title}`);
      case "replace-dinner":
        return run({ ...base, pinSessionId: o.sessionId, excludeRestaurantIds: [...(rev.excludeRestaurantIds ?? []), o.dinner!.restaurant.id] }, `Different dinner after ${o.event.title}`);
      case "sellout":
        return run({ ...base, simulatedSoldOut: [...(rev.simulatedSoldOut ?? []), o.sessionId] }, `Demo: ${o.event.title} sold out (simulated)`);
    }
  };

  if (!hasInventory)
    return (
      <div className="mt-6 rounded-[24px] border border-dashed border-ivory/20 p-6">
        <p className="text-[15px]">There are no listings in {city.name} yet, so there&apos;s nothing to plan with.</p>
        <Link href={`/wishes/new?city=${city.id}`} className="mt-3 inline-flex h-11 items-center rounded-full bg-citron px-5 font-bold text-ink">Make a wish instead</Link>
      </div>
    );

  return (
    <div className="mt-5 grid gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
      <form onSubmit={submit} className="flex flex-col gap-4 rounded-[24px] border border-line bg-card p-5 lg:sticky lg:top-20 lg:self-start" aria-label="Plan request">
        <div>
          <label htmlFor="describe" className="text-[13px] font-semibold">Describe it (optional)</label>
          <div className="mt-1 flex gap-2">
            <input id="describe" value={describe} onChange={(e) => setDescribe(e.target.value)} placeholder="e.g. comedy this weekend for 2 under 1500" className={`${input} mt-0`} />
            <button type="button" onClick={fillFromText} disabled={!describe.trim()} className="h-11 flex-none rounded-full border border-ivory/25 px-4 text-[13px] font-semibold disabled:opacity-40">Fill in</button>
          </div>
          <p className="mt-1 text-[12px] text-muted">Fills the fields below so you can check them. Nothing runs until you press Find options.</p>
        </div>
        <fieldset className="grid grid-cols-2 gap-3">
          <legend className="mb-1 text-[13px] font-semibold">When are you free? (required)</legend>
          <label className="text-[12px] text-muted">From<input type="date" min={today} required className={input} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
          <label className="text-[12px] text-muted">To<input type="date" min={f.from || today} required className={input} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
          <label className="text-[12px] text-muted">Earliest start<input type="time" className={input} value={f.earliest} onChange={(e) => setF({ ...f, earliest: e.target.value })} /></label>
          <label className="text-[12px] text-muted">Latest start<input type="time" className={input} value={f.latest} onChange={(e) => setF({ ...f, latest: e.target.value })} /></label>
        </fieldset>
        <fieldset className="grid grid-cols-2 gap-3">
          <legend className="mb-1 text-[13px] font-semibold">Where</legend>
          <label className="text-[12px] text-muted">Near
            <select className={input} value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}>
              <option value="">Anywhere in {city.name}</option>
              {areas.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
            </select>
          </label>
          <label className="text-[12px] text-muted">Max distance (km)<input inputMode="decimal" disabled={!f.area} className={`${input} disabled:opacity-40`} value={f.maxKm} onChange={(e) => setF({ ...f, maxKm: e.target.value.replace(/[^\d.]/g, "") })} placeholder={f.area ? "No limit" : "Pick an area"} /></label>
        </fieldset>
        <fieldset className="grid grid-cols-2 gap-3">
          <legend className="mb-1 text-[13px] font-semibold">Budget ({city.currency}, optional)</legend>
          <label className="text-[12px] text-muted">Amount<input inputMode="decimal" className={input} value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value.replace(/[^\d.]/g, "") })} placeholder="No limit" /></label>
          <label className="text-[12px] text-muted">Applies to
            <select className={input} value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as Form["mode"] })}>
              <option value="per-person">Each person</option>
              <option value="total">The whole group</option>
            </select>
          </label>
          <p className="col-span-2 text-[12px] text-muted">Includes ticket fees{f.dinner ? " and the dinner estimate" : ""}.{f.budget && f.party > 1 ? ` ${f.mode === "total" ? `That's ${formatMoney(Number(f.budget) / f.party, city.currency)} each.` : `That's ${formatMoney(Number(f.budget) * f.party, city.currency)} for the group.`}` : ""}</p>
        </fieldset>
        <div>
          <span className="text-[13px] font-semibold" id="party-l">People</span>
          <div className="mt-1 flex items-center gap-3" role="group" aria-labelledby="party-l">
            <button type="button" aria-label="Fewer people" disabled={f.party <= 1} onClick={() => setF({ ...f, party: f.party - 1 })} className="size-11 rounded-full border border-ivory/20 text-[20px] disabled:opacity-30">−</button>
            <output className="tnum min-w-10 text-center font-bold" aria-live="polite">{f.party}</output>
            <button type="button" aria-label="More people" disabled={f.party >= 10} onClick={() => setF({ ...f, party: f.party + 1 })} className="size-11 rounded-full border border-ivory/20 text-[20px] disabled:opacity-30">+</button>
          </div>
        </div>
        <fieldset>
          <legend className="text-[13px] font-semibold">Activities (any if none chosen)</legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => {
              const on = f.categories.includes(c);
              return (
                <button key={c} type="button" aria-pressed={on} onClick={() => setF({ ...f, categories: on ? f.categories.filter((x) => x !== c) : [...f.categories, c] })} className={`h-9 rounded-full px-3 text-[12px] font-semibold ${on ? "bg-citron text-ink" : "border border-ivory/20"}`}>
                  {c}
                </button>
              );
            })}
          </div>
          <label className="mt-2 block text-[12px] text-muted">Must have keywords (optional)<input className={input} value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} placeholder="e.g. jazz, pottery" /></label>
        </fieldset>
        <label className="flex min-h-11 items-center justify-between gap-3 text-[14px]">
          <span>Add a dinner stop nearby <span className="block text-[12px] text-muted">Sample restaurants, estimated cost, not reserved</span></span>
          <input type="checkbox" checked={f.dinner} onChange={(e) => setF({ ...f, dinner: e.target.checked })} className="size-5 accent-[var(--color-citron)]" />
        </label>
        {error && <p role="alert" className="text-[14px] font-semibold text-citron">{error}</p>}
        <button type="submit" disabled={state === "loading"} className="h-12 rounded-full bg-citron font-bold text-ink disabled:opacity-60">{state === "loading" ? "Finding options…" : "Find options"}</button>
      </form>

      <section aria-live="polite" aria-busy={state === "loading"} aria-label="Plan options">
        {!result && state !== "loading" && <p className="rounded-[24px] border border-dashed border-ivory/20 p-6 text-[14px] text-muted">Your options will appear here. Only dates are required; everything else narrows the search.</p>}
        {state === "loading" && !result && <div className="h-64 animate-pulse rounded-[24px] bg-card motion-reduce:animate-none" />}
        {result && (
          <div className="flex flex-col gap-4">
            {history.length > 0 && (
              <div className="rounded-[16px] border border-line p-3 text-[13px]">
                <p className="font-semibold">Revisions (your other requirements are unchanged)</p>
                <ul className="mt-1 list-disc pl-5 text-ivory/80">{history.map((h, i) => <li key={i}>{h}</li>)}</ul>
                <button type="button" onClick={() => { setHistory([]); run({}); }} className="mt-2 h-9 text-[13px] font-semibold text-citron underline underline-offset-4">Undo all revisions</button>
              </div>
            )}
            <p className="text-[13px] text-muted">
              {result.feasibleCount} event{result.feasibleCount === 1 ? "" : "s"} meet every requirement out of {result.considered} in {city.name}.
              {result.options.length ? ` Showing ${result.options.length}${result.tasteUsed ? ", ordered by your interests" : ", soonest first"}.` : ""}
            </p>
            {result.options.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-ivory/20 p-5">
                <h2 className="font-display text-[17px]">Nothing meets all your requirements</h2>
                <p className="mt-1 text-[14px] text-ivory/80">Nothing was relaxed automatically. These constraints ruled events out:</p>
                <ul className="mt-2 flex flex-col gap-2 text-[14px]">
                  {result.blockers.map((b) => (
                    <li key={b.constraint}><span className="font-semibold capitalize">{b.constraint}</span> ({b.count} event{b.count === 1 ? "" : "s"}): {b.suggestion}</li>
                  ))}
                </ul>
              </div>
            ) : (
              result.options.map((o) => {
                const before = prev?.find((p) => p.event.id === o.event.id);
                return (
                  <article key={o.sessionId} className="overflow-hidden rounded-[24px] border border-line bg-card">
                    <div className="flex flex-col gap-4 p-4 sm:flex-row">
                      <Image src={o.event.image} alt="" width={180} height={120} className="h-32 w-full flex-none rounded-[16px] object-cover sm:w-44" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap gap-1.5">
                          {o.labels.map((l) => <span key={l} className="rounded-full bg-citron px-2.5 py-0.5 text-[11px] font-bold text-ink">{l}</span>)}
                          {!before && prev && <span className="rounded-full border border-citron px-2.5 py-0.5 text-[11px] font-bold text-citron">New</span>}
                        </div>
                        <h3 className="mt-1 font-display text-[16px]">{o.event.title}</h3>
                        <p className="tnum text-[13px] text-ivory/80">{formatDayTime(o.start)} · {o.event.venue.name}, {o.event.venue.area}{o.distanceKm !== null ? ` · ${o.distanceKm.toFixed(1)} km` : ""}</p>
                        {o.reason && <p className="mt-1 text-[12px] text-ivory/70">{o.reason}</p>}
                        {o.tradeoffs.length > 0 && <p className="mt-1 text-[12px] text-muted">Trade-off: {o.tradeoffs.join("; ")}.</p>}
                      </div>
                    </div>
                    <dl className="tnum grid gap-1 border-t border-line px-4 py-3 text-[13px]">
                      <div className="flex justify-between"><dt>Tickets: {o.tier.name} × {f.party} incl. fees</dt><dd className="font-semibold">{formatMoney(o.bookingTotal, o.event.currency)}</dd></div>
                      {o.dinner && <div className="flex justify-between text-ivory/80"><dt>Dinner estimate: {o.dinner.restaurant.name}, {formatClock(o.dinner.start)} ({Math.round(o.dinner.walkM / 50) * 50} m walk, est.)</dt><dd>~{formatMoney(o.dinner.estimate, o.event.currency)}</dd></div>}
                      <div className="flex justify-between font-bold"><dt>{o.dinner ? "Estimated total" : "Total"}</dt><dd>{formatMoney(o.total, o.event.currency)} <span className="font-normal text-muted">({formatMoney(o.perPerson, o.event.currency)} each)</span></dd></div>
                      {o.dinner && <p className="text-[11px] text-muted">The dinner is a suggestion from sample data. No table is reserved.</p>}
                    </dl>
                    <details className="border-t border-line px-4 py-3">
                      <summary className="cursor-pointer text-[13px] font-semibold">Requirement checks ({o.checks.filter((c) => c.ok).length}/{o.checks.length} met)</summary>
                      <ul className="mt-2 flex flex-col gap-1 text-[13px]">
                        {o.checks.map((c) => <li key={c.label}><span className={c.ok ? "text-citron" : "text-muted"}>{c.ok ? "✓" : "–"}</span> <span className="font-semibold">{c.label}:</span> {c.detail}</li>)}
                      </ul>
                    </details>
                    <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
                      <Link href={`/events/${o.event.id}/book?session=${o.sessionId}&qty=${f.party}&from=plan`} className="flex h-10 items-center rounded-full bg-citron px-4 text-[13px] font-bold text-ink">Choose tickets</Link>
                      <Link href={`/events/${o.event.id}?session=${o.sessionId}&back=/plan`} className="flex h-10 items-center rounded-full border border-ivory/25 px-4 text-[13px] font-semibold">View event</Link>
                      <SavePlanButton
                        o={o}
                        party={f.party}
                        saved={savedPlans.has(o.sessionId)}
                        onSaved={() => {
                          setSavedPlans((s) => new Set(s).add(o.sessionId));
                          router.refresh();
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5 border-t border-line px-4 py-3" role="group" aria-label={`Revise ${o.event.title}`}>
                      <span className="mr-1 self-center text-[12px] font-semibold text-muted">Revise:</span>
                      {[
                        ["cheaper", "Cheaper"],
                        ...(o.distanceKm !== null ? [["closer", "Closer"]] : []),
                        ["earlier", "Earlier"],
                        ["later", "Later"],
                        ["different", "Different activity"],
                        ["replace-event", "Replace this event"],
                        ...(o.dinner ? [["replace-dinner", "Replace only dinner"], ["nodinner", "Remove dinner"]] : []),
                      ].map(([k, label]) => (
                        <button key={k} type="button" onClick={() => revise(o, k)} disabled={state === "loading"} className="h-9 rounded-full border border-ivory/20 px-3 text-[12px] font-semibold hover:border-ivory/50">{label}</button>
                      ))}
                      <button type="button" onClick={() => revise(o, "sellout")} disabled={state === "loading"} className="h-9 rounded-full border border-dashed border-citron/60 px-3 text-[12px] font-semibold text-citron">Demo: simulate sell-out</button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        )}
      </section>
    </div>
  );
}
