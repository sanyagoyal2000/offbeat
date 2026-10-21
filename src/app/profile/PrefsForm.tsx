"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CATEGORIES } from "@/lib/categories";
import type { Prefs } from "@/lib/server/notifications";

export function PrefsForm({ initial }: { initial: Prefs }) {
  const [p, setP] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const save = async () => {
    const res = await fetch("/api/prefs", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(p) });
    setMsg(res.ok ? "Saved" : "Couldn't save. Try again.");
  };
  return (
    <div className="mt-3 flex flex-col gap-4">
      <label className="flex min-h-11 items-start gap-3 text-[14px]">
        <input type="checkbox" checked={p.optIn} onChange={(e) => setP({ ...p, optIn: e.target.checked })} className="mt-0.5 size-5 accent-[var(--color-citron)]" />
        <span>In-app updates about new events and proposals<span className="block text-[12px] text-muted">Shown in your Inbox.</span></span>
      </label>
      <label className="flex min-h-11 items-start gap-3 text-[14px]">
        <input type="checkbox" checked={p.audienceOptIn} onChange={(e) => setP({ ...p, audienceOptIn: e.target.checked })} className="mt-0.5 size-5 accent-[var(--color-citron)]" />
        <span>Count my interests in organizer audience estimates<span className="block text-[12px] text-muted">Organizers see anonymous totals only, never who you are. You may see their in-app promo cards.</span></span>
      </label>
      <fieldset disabled={!p.optIn} className="disabled:opacity-50">
        <legend className="text-[13px] font-semibold">Topics</legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => {
            const on = p.categories.includes(c);
            return <button key={c} type="button" aria-pressed={on} onClick={() => setP({ ...p, categories: on ? p.categories.filter((x) => x !== c) : [...p.categories, c] })} className={`h-9 rounded-full px-3 text-[12px] font-semibold ${on ? "bg-citron text-ink" : "border border-ivory/20"}`}>{c}</button>;
          })}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-[13px] font-semibold">Frequency
          <select disabled={!p.optIn} value={p.frequency} onChange={(e) => setP({ ...p, frequency: e.target.value as Prefs["frequency"] })} className="mt-1 h-11 w-full rounded-[12px] border border-ivory/20 bg-ink px-3">
            <option value="as-it-happens">As it happens</option>
            <option value="daily">Daily digest</option>
            <option value="weekly">Weekly digest</option>
          </select>
        </label>
        <label className="text-[13px] font-semibold">Quiet from<input type="time" disabled={!p.optIn} value={p.quietHours?.from ?? ""} onChange={(e) => setP({ ...p, quietHours: { from: e.target.value, to: p.quietHours?.to ?? "08:00" } })} className="mt-1 h-11 w-full rounded-[12px] border border-ivory/20 bg-ink px-3" /></label>
        <label className="text-[13px] font-semibold">Quiet until<input type="time" disabled={!p.optIn} value={p.quietHours?.to ?? ""} onChange={(e) => setP({ ...p, quietHours: { from: p.quietHours?.from ?? "22:00", to: e.target.value } })} className="mt-1 h-11 w-full rounded-[12px] border border-ivory/20 bg-ink px-3" /></label>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} className="h-11 rounded-full bg-citron px-5 font-bold text-ink">Save settings</button>
        <span aria-live="polite" className="text-[13px] text-muted">{msg}</span>
      </div>
    </div>
  );
}

export function MarkRead() {
  const router = useRouter();
  return (
    <button type="button" onClick={async () => { await fetch("/api/inbox", { method: "POST" }); router.refresh(); }} className="h-9 text-[13px] font-semibold text-citron underline underline-offset-4">
      Mark all read
    </button>
  );
}
