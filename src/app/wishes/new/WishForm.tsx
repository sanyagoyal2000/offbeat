"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LocationPicker } from "@/components/LocationPicker";
import { CATEGORIES, type Category } from "@/lib/categories";
import type { Location } from "@/lib/locations";
import { parseSearch } from "@/lib/searchParse";
import { todayIn, formatMoney } from "@/lib/tz";
import type { WishInput } from "@/lib/wishes";

type Area = { name: string; lat: number; lng: number };
const input = "mt-1 h-11 w-full rounded-[12px] border border-ivory/20 bg-ink px-3 text-[14px]";

export function WishForm({
  location: initialLoc,
  areas,
  interests,
  prefill,
  existing,
}: {
  location: Location;
  areas: Area[];
  interests: { id: string; name: string }[];
  prefill: { category: Category | null; keywords: string[]; from: string | null; to: string | null; budgetMax: number | null; area: string | null };
  existing?: { id: string; input: WishInput };
}) {
  const router = useRouter();
  const [loc, setLoc] = useState(initialLoc);
  const [step, setStep] = useState<"describe" | "review">(existing ? "review" : prefill.category || prefill.keywords.length ? "review" : "describe");
  const [text, setText] = useState(existing?.input.text ?? "");
  const [f, setF] = useState({
    category: existing?.input.category ?? prefill.category,
    keywords: (existing?.input.keywords ?? prefill.keywords).join(" "),
    from: existing?.input.from ?? prefill.from ?? "",
    to: existing?.input.to ?? prefill.to ?? "",
    budget: (existing?.input.budgetMax ?? prefill.budgetMax)?.toString() ?? "",
    area: existing?.input.location.area ?? prefill.area ?? "",
    radiusKm: existing?.input.location.radiusKm ?? 5,
    refs: existing?.input.tasteRefs.map((r) => r.id) ?? ([] as string[]),
    notify: existing?.input.notify ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = todayIn(loc.timezone);

  const review = () => {
    const p = parseSearch(text, today);
    setF((x) => ({
      ...x,
      category: p.category ?? x.category,
      keywords: p.keywords.join(" ") || x.keywords,
      from: p.range?.from ?? x.from,
      to: p.range?.to ?? x.to,
      budget: p.maxPrice !== undefined ? String(p.maxPrice) : x.budget,
      area: p.near ? (areas.find((a) => a.name.toLowerCase().includes(p.near!.toLowerCase()))?.name ?? p.near) : x.area,
    }));
    setStep("review");
  };

  const save = async () => {
    setError(null);
    if (f.from && f.to && f.from > f.to) return setError("The end date is before the start date.");
    const area = areas.find((a) => a.name === f.area);
    const body: WishInput = {
      text,
      category: f.category,
      keywords: f.keywords.toLowerCase().split(/[\s,]+/).filter((k) => k.length >= 2).slice(0, 6),
      from: f.from || null,
      to: f.to || null,
      budgetMax: f.budget ? Number(f.budget) : null,
      currency: loc.currency,
      location: { cityId: loc.id, cityName: loc.name, area: f.area || null, lat: area?.lat ?? loc.lat, lng: area?.lng ?? loc.lng, radiusKm: f.radiusKm },
      tasteRefs: interests.filter((i) => f.refs.includes(i.id)),
      notify: f.notify,
    };
    setSaving(true);
    try {
      const res = await fetch(existing ? `/api/wishes/${existing.id}` : "/api/wishes", { method: existing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't save the wish.");
      router.push(`/wishes/${json.wish.id}${existing ? "" : "?new=1"}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  if (step === "describe")
    return (
      <div className="mt-5 flex flex-col gap-3">
        <label htmlFor="wish-text" className="text-[14px] font-semibold">What would you go to?</label>
        <textarea id="wish-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. An intimate acoustic set near Indiranagar on a weekend, under 1500" className="rounded-[16px] border border-ivory/20 bg-card p-4 text-[16px]" />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={review} disabled={!text.trim()} className="h-12 rounded-full bg-citron px-6 font-bold text-ink disabled:opacity-40">Review details</button>
          <button type="button" onClick={() => setStep("review")} className="h-12 rounded-full border border-ivory/25 px-6 font-semibold">Fill in the form instead</button>
        </div>
      </div>
    );

  return (
    <div className="mt-5 flex flex-col gap-4">
      {text && <p className="rounded-[16px] bg-card p-3 text-[14px] text-ivory/80">“{text}”</p>}
      <p className="text-[13px] text-muted">Check what we understood and correct anything before saving. Blank fields mean you&apos;re flexible.</p>
      <div className="grid gap-4 rounded-[24px] border border-line bg-card p-5 sm:grid-cols-2">
        <label className="text-[13px] font-semibold">Activity
          <select className={input} value={f.category ?? ""} onChange={(e) => setF({ ...f, category: (e.target.value || null) as Category | null })}>
            <option value="">Any</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="text-[13px] font-semibold">Key words (optional)<input className={input} value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} placeholder="e.g. acoustic, pottery" /></label>
        <label className="text-[13px] font-semibold">Free from<input type="date" min={today} className={input} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
        <label className="text-[13px] font-semibold">Free until<input type="date" min={f.from || today} className={input} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
        <label className="text-[13px] font-semibold">Budget per person ({loc.currency})<input inputMode="decimal" className={input} value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value.replace(/[^\d.]/g, "") })} placeholder="Not set" /></label>
        <div className="text-[13px] font-semibold">City
          <div className="mt-1"><LocationPicker current={loc} kind="explore" variant="field" persist={false} onChanged={(l) => { setLoc(l); setF((x) => ({ ...x, area: "" })); }} /></div>
        </div>
        <label className="text-[13px] font-semibold">Area
          {areas.length && loc.id === initialLoc.id ? (
            <select className={input} value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}>
              <option value="">Anywhere in {loc.name}</option>
              {areas.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
            </select>
          ) : (
            <input className={input} value={f.area} maxLength={60} onChange={(e) => setF({ ...f, area: e.target.value })} placeholder={`Anywhere in ${loc.name}`} />
          )}
        </label>
        <label className="text-[13px] font-semibold">How far you&apos;d travel: {f.radiusKm} km
          <input type="range" min={1} max={50} value={f.radiusKm} onChange={(e) => setF({ ...f, radiusKm: Number(e.target.value) })} className="mt-3 w-full accent-[var(--color-citron)]" />
        </label>
        {interests.length > 0 && (
          <fieldset className="sm:col-span-2">
            <legend className="text-[13px] font-semibold">Taste references (optional, from your interests)</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {interests.map((i) => {
                const on = f.refs.includes(i.id);
                return <button key={i.id} type="button" aria-pressed={on} onClick={() => setF({ ...f, refs: on ? f.refs.filter((x) => x !== i.id) : [...f.refs, i.id] })} className={`h-9 rounded-full px-3 text-[13px] font-semibold ${on ? "bg-citron text-ink" : "border border-ivory/20"}`}>{i.name}</button>;
              })}
            </div>
          </fieldset>
        )}
      </div>
      <label className="flex min-h-11 items-start gap-3 rounded-[16px] border border-line p-4 text-[14px]">
        <input type="checkbox" checked={f.notify} onChange={(e) => setF({ ...f, notify: e.target.checked })} className="mt-0.5 size-5 accent-[var(--color-citron)]" />
        <span>
          Count my wish and tell me in the app when an organizer proposes something
          <span className="block text-[12px] text-muted">Only people who opt in are counted. Organizers see totals, never names. Showing interest isn&apos;t a commitment to buy.</span>
        </span>
      </label>
      <p className="tnum text-[13px] text-ivory/80">
        Summary: {[f.category ?? "Any activity", f.keywords].filter(Boolean).join(" · ")} · {f.area || `anywhere in ${loc.name}`} (within {f.radiusKm} km) · {f.from && f.to ? `${f.from} to ${f.to}` : "any dates"} · {f.budget ? `up to ${formatMoney(Number(f.budget), loc.currency)}` : "no budget"}
      </p>
      {error && <p role="alert" className="text-[14px] font-semibold text-citron">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={saving} className="h-12 rounded-full bg-citron px-6 font-bold text-ink disabled:opacity-60">{saving ? "Saving…" : existing ? "Save changes" : "Save wish"}</button>
        {!existing && <button type="button" onClick={() => setStep("describe")} className="h-12 rounded-full border border-ivory/25 px-6 font-semibold">Back</button>}
      </div>
    </div>
  );
}
