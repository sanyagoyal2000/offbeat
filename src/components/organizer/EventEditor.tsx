"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CATEGORIES, type Category } from "@/lib/categories";
import type { EventInput } from "@/lib/server/organizer";
import { LAYOUTS, sectionCapacity, sections } from "@/lib/seating";
import { photoLibrary } from "@/lib/photoCredits";

type Session = EventInput["sessions"][number];
/** Freely licensed library photos (credited automatically on the event page). */
const IMAGES = photoLibrary().map((p) => [p.src, p.label] as const);

const input = "mt-1 h-11 w-full rounded-[12px] border border-ivory/20 bg-ink px-3 text-[14px]";
const area = "mt-1 w-full rounded-[12px] border border-ivory/20 bg-ink p-3 text-[14px]";
const toLines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const fromLines = (a?: string[]) => (a ?? []).join("\n");

export function EventEditor({
  initial,
  eventId,
  cities,
  reservedBySession,
  readOnly,
}: {
  initial: EventInput;
  eventId?: string;
  cities: { id: string; name: string; currency: string; lat: number; lng: number }[];
  reservedBySession: Record<string, number>;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState<EventInput>(initial);
  const [text, setText] = useState({
    whatYoullDo: fromLines(initial.whatYoullDo),
    inclusions: fromLines(initial.inclusions),
    exclusions: fromLines(initial.exclusions),
    bring: fromLines(initial.bring),
    restrictions: fromLines(initial.restrictions),
    performers: (initial.show?.performers ?? []).join("\n"),
    equipment: fromLines(initial.trek?.equipment),
    itinerary: (initial.trek?.itinerary ?? []).map((s) => `${s.time} ${s.step}`).join("\n"),
  });
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const city = cities.find((c) => c.id === v.cityId);
  const set = <K extends keyof EventInput>(k: K, val: EventInput[K]) => setV((x) => ({ ...x, [k]: val }));
  const err = (path: string) => issues[path] ?? Object.entries(issues).find(([k]) => k.startsWith(`${path}.`))?.[1];

  const updateSession = (i: number, s: Partial<Session>) => set("sessions", v.sessions.map((x, j) => (j === i ? { ...x, ...s } : x)));
  const updateTier = (si: number, ti: number, t: Partial<Session["tiers"][number]>) =>
    updateSession(si, { tiers: v.sessions[si].tiers.map((x, j) => (j === ti ? { ...x, ...t } : x)) });

  const submit = async (status: "draft" | "published") => {
    setError(null);
    setIssues({});
    const c = v.category;
    const body: EventInput = {
      ...v,
      status,
      whatYoullDo: toLines(text.whatYoullDo),
      inclusions: toLines(text.inclusions),
      exclusions: toLines(text.exclusions),
      bring: toLines(text.bring),
      restrictions: toLines(text.restrictions),
      show: ["Music", "Comedy", "Theatre", "Performances", "Kids"].includes(c) ? { performers: toLines(text.performers), doorsBeforeMin: v.show?.doorsBeforeMin, seating: v.show?.seating } : undefined,
      movie: c === "Movies" ? v.movie : undefined,
      class: c === "Workshops & classes" ? (v.class ?? { level: "", durationMin: v.durationMin }) : undefined,
      trek:
        c === "Treks & outdoors"
          ? {
              ...(v.trek ?? { difficulty: "", meetingPoint: "", transport: "", equipment: [], itinerary: [] }),
              equipment: toLines(text.equipment),
              itinerary: toLines(text.itinerary).map((l) => ({ time: l.slice(0, 5), step: l.slice(5).trim() })),
            }
          : undefined,
    };
    setSaving(true);
    try {
      const res = await fetch(eventId ? `/api/organizer/events/${eventId}` : "/api/organizer/events", { method: eventId ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Couldn't save.");
        if (json.issues) setIssues(Object.fromEntries((json.issues as { path: string; message: string }[]).map((i) => [i.path, i.message])));
        return;
      }
      const q = json.proposals ? `?proposed=${json.proposals.matched}&seed=${json.proposals.seedMatches}` : "?saved=1";
      router.push(`/organizer/events/${json.event.id}${q}`);
      router.refresh();
    } catch {
      setError("Network problem. Your changes weren't saved.");
    } finally {
      setSaving(false);
    }
  };

  const Err = ({ p }: { p: string }) => (err(p) ? <span role="alert" className="mt-1 block text-[12px] font-semibold text-citron">{err(p)}</span> : null);

  return (
    <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-5" aria-label="Event details">
      <fieldset disabled={readOnly || saving} className="flex flex-col gap-5">
        <section className="grid gap-4 rounded-[24px] border border-line bg-card p-5 sm:grid-cols-2">
          <h2 className="text-[15px] font-bold sm:col-span-2">Basics</h2>
          <label className="text-[13px] font-semibold sm:col-span-2">Official event name<input className={input} value={v.title} onChange={(e) => set("title", e.target.value)} /><Err p="title" /></label>
          <label className="text-[13px] font-semibold">Category
            <select className={input} value={v.category} onChange={(e) => set("category", e.target.value as Category)}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-[13px] font-semibold">City
            <select className={input} value={v.cityId} disabled={!!eventId} onChange={(e) => { const c = cities.find((x) => x.id === e.target.value)!; setV((x) => ({ ...x, cityId: c.id, venue: { ...x.venue, lat: c.lat, lng: c.lng } })); }}>
              {cities.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.currency})</option>)}
            </select>
            <span className="mt-1 block text-[12px] text-muted">{eventId ? "City and currency are fixed after creation." : `Prices in ${city?.currency}. Times are venue-local.`}</span>
          </label>
          <label className="text-[13px] font-semibold sm:col-span-2">One-line summary<input className={input} maxLength={120} value={v.summary} onChange={(e) => set("summary", e.target.value)} /><Err p="summary" /></label>
          <label className="text-[13px] font-semibold sm:col-span-2">Description<textarea rows={4} className={area} value={v.description} onChange={(e) => set("description", e.target.value)} /><Err p="description" /></label>
          <label className="text-[13px] font-semibold">What attendees will do (one per line)<textarea rows={3} className={area} value={text.whatYoullDo} onChange={(e) => setText({ ...text, whatYoullDo: e.target.value })} /></label>
          <label className="text-[13px] font-semibold">Who it&apos;s for<textarea rows={3} className={area} value={v.audience ?? ""} onChange={(e) => set("audience", e.target.value)} /></label>
          <label className="text-[13px] font-semibold">Duration (minutes)<input type="number" min={15} className={input} value={v.durationMin} onChange={(e) => set("durationMin", Number(e.target.value))} /><Err p="durationMin" /></label>
          <label className="text-[13px] font-semibold">Seating
            <select
              className={input}
              value={v.seatLayout ?? ""}
              onChange={(e) => {
                const id = e.target.value || undefined;
                const layout = id ? LAYOUTS[id] : null;
                setV((x) => ({
                  ...x,
                  seatLayout: id,
                  sessions: layout ? x.sessions.map((s) => ({ ...s, tiers: sections(layout).map((name) => ({ id: s.tiers.find((t) => t.name === name)?.id, name, price: s.tiers.find((t) => t.name === name)?.price ?? 0, capacity: sectionCapacity(layout, name) })) })) : x.sessions,
                }));
              }}
            >
              <option value="">General admission (no seat numbers)</option>
              {Object.values(LAYOUTS).map((l) => <option key={l.id} value={l.id}>Reserved seats: {l.label} ({l.rows.reduce((n, r) => n + r.seats, 0)} seats)</option>)}
            </select>
            <span className="mt-1 block text-[12px] text-muted">{v.seatLayout ? "Ticket types are the layout's sections; capacity comes from the seat map." : "Attendees get unnumbered tickets."}</span>
          </label>
          <label className="text-[13px] font-semibold">Image
            <select className={input} value={v.image} onChange={(e) => set("image", e.target.value)}>
              {IMAGES.map(([src, label]) => <option key={src} value={src}>{label}</option>)}
            </select>
          </label>
        </section>

        <section className="grid gap-4 rounded-[24px] border border-line bg-card p-5 sm:grid-cols-2">
          <h2 className="text-[15px] font-bold sm:col-span-2">Venue</h2>
          <label className="text-[13px] font-semibold">Venue name<input className={input} value={v.venue.name} onChange={(e) => set("venue", { ...v.venue, name: e.target.value })} /><Err p="venue.name" /></label>
          <label className="text-[13px] font-semibold">Area / neighbourhood<input className={input} value={v.venue.area} onChange={(e) => set("venue", { ...v.venue, area: e.target.value })} /><Err p="venue.area" /></label>
          <label className="text-[13px] font-semibold sm:col-span-2">Address (optional)<input className={input} value={v.venue.address ?? ""} onChange={(e) => set("venue", { ...v.venue, address: e.target.value })} /></label>
          <label className="text-[13px] font-semibold">Latitude<input type="number" step="0.0001" className={input} value={v.venue.lat} onChange={(e) => set("venue", { ...v.venue, lat: Number(e.target.value) })} /></label>
          <label className="text-[13px] font-semibold">Longitude<input type="number" step="0.0001" className={input} value={v.venue.lng} onChange={(e) => set("venue", { ...v.venue, lng: Number(e.target.value) })} /></label>
          <p className="text-[12px] text-muted sm:col-span-2">Coordinates default to the city centre. Set the venue&apos;s real coordinates so distance filters are accurate.</p>
        </section>

        {v.category === "Movies" && (
          <section className="grid gap-4 rounded-[24px] border border-line bg-card p-5 sm:grid-cols-2">
            <h2 className="text-[15px] font-bold sm:col-span-2">Film details</h2>
            <label className="text-[13px] font-semibold">Language<input className={input} value={v.movie?.language ?? ""} onChange={(e) => set("movie", { runtimeMin: 90, ...v.movie, language: e.target.value })} /></label>
            <label className="text-[13px] font-semibold">Subtitles<input className={input} value={v.movie?.subtitles ?? ""} onChange={(e) => set("movie", { language: "", runtimeMin: 90, ...v.movie, subtitles: e.target.value })} /></label>
            <label className="text-[13px] font-semibold">Runtime (min)<input type="number" className={input} value={v.movie?.runtimeMin ?? ""} onChange={(e) => set("movie", { language: "", ...v.movie, runtimeMin: Number(e.target.value) })} /></label>
            <label className="text-[13px] font-semibold">Certification (if any)<input className={input} value={v.movie?.certification ?? ""} onChange={(e) => set("movie", { language: "", runtimeMin: 90, ...v.movie, certification: e.target.value })} /></label>
            <Err p="movie" />
          </section>
        )}
        {["Music", "Comedy", "Theatre", "Performances", "Kids"].includes(v.category) && (
          <section className="grid gap-4 rounded-[24px] border border-line bg-card p-5 sm:grid-cols-2">
            <h2 className="text-[15px] font-bold sm:col-span-2">Show details</h2>
            <label className="text-[13px] font-semibold">Performers (one per line)<textarea rows={3} className={area} value={text.performers} onChange={(e) => setText({ ...text, performers: e.target.value })} /><Err p="show" /></label>
            <div className="flex flex-col gap-3">
              <label className="text-[13px] font-semibold">Doors open (minutes before)<input type="number" min={0} className={input} value={v.show?.doorsBeforeMin ?? ""} onChange={(e) => set("show", { performers: [], ...v.show, doorsBeforeMin: e.target.value ? Number(e.target.value) : undefined })} /></label>
              <label className="text-[13px] font-semibold">Seating<input className={input} placeholder="e.g. Seated, unreserved" value={v.show?.seating ?? ""} onChange={(e) => set("show", { performers: [], ...v.show, seating: e.target.value })} /></label>
            </div>
          </section>
        )}
        {v.category === "Workshops & classes" && (
          <section className="grid gap-4 rounded-[24px] border border-line bg-card p-5 sm:grid-cols-3">
            <h2 className="text-[15px] font-bold sm:col-span-3">Class details</h2>
            <label className="text-[13px] font-semibold">Level<input className={input} placeholder="Beginner" value={v.class?.level ?? ""} onChange={(e) => set("class", { durationMin: v.durationMin, ...v.class, level: e.target.value })} /></label>
            <label className="text-[13px] font-semibold">Materials<input className={input} value={v.class?.materials ?? ""} onChange={(e) => set("class", { level: "", durationMin: v.durationMin, ...v.class, materials: e.target.value })} /></label>
            <label className="text-[13px] font-semibold">Session length (min)<input type="number" className={input} value={v.class?.durationMin ?? v.durationMin} onChange={(e) => set("class", { level: "", ...v.class, durationMin: Number(e.target.value) })} /></label>
            <Err p="class" />
          </section>
        )}
        {v.category === "Treks & outdoors" && (
          <section className="grid gap-4 rounded-[24px] border border-line bg-card p-5 sm:grid-cols-2">
            <h2 className="text-[15px] font-bold sm:col-span-2">Trek details</h2>
            {(["difficulty", "meetingPoint", "transport"] as const).map((k) => (
              <label key={k} className="text-[13px] font-semibold">{k === "meetingPoint" ? "Meeting point" : k === "difficulty" ? "Difficulty (your rating)" : "Transport"}
                <input className={input} value={v.trek?.[k] ?? ""} onChange={(e) => set("trek", { difficulty: "", meetingPoint: "", transport: "", equipment: [], itinerary: [], ...v.trek, [k]: e.target.value })} />
              </label>
            ))}
            <label className="text-[13px] font-semibold">Distance (km)<input type="number" className={input} value={v.trek?.distanceKm ?? ""} onChange={(e) => set("trek", { difficulty: "", meetingPoint: "", transport: "", equipment: [], itinerary: [], ...v.trek, distanceKm: e.target.value ? Number(e.target.value) : undefined })} /></label>
            <label className="text-[13px] font-semibold">Equipment (one per line)<textarea rows={3} className={area} value={text.equipment} onChange={(e) => setText({ ...text, equipment: e.target.value })} /></label>
            <label className="text-[13px] font-semibold">Itinerary (one per line, &quot;HH:MM step&quot;)<textarea rows={3} className={area} value={text.itinerary} onChange={(e) => setText({ ...text, itinerary: e.target.value })} /></label>
            <Err p="trek" />
          </section>
        )}

        <section className="grid gap-4 rounded-[24px] border border-line bg-card p-5 sm:grid-cols-2">
          <h2 className="text-[15px] font-bold sm:col-span-2">Facts and policies (only what&apos;s true)</h2>
          <div className="flex flex-wrap gap-4 sm:col-span-2">
            {(["beginnerFriendly", "materialsIncluded", "soloFriendly", "familyFriendly"] as const).map((k) => (
              <label key={k} className="flex min-h-11 items-center gap-2 text-[14px]">
                <input type="checkbox" checked={!!v.facts[k]} onChange={(e) => set("facts", { ...v.facts, [k]: e.target.checked || undefined })} className="size-5 accent-[var(--color-citron)]" />
                {{ beginnerFriendly: "Beginner friendly", materialsIncluded: "Materials included", soloFriendly: "Good for going solo", familyFriendly: "Family friendly" }[k]}
              </label>
            ))}
            <label className="text-[13px] font-semibold">Minimum age<input type="number" min={0} max={25} className={`${input} w-28`} value={v.facts.ageMin ?? ""} onChange={(e) => set("facts", { ...v.facts, ageMin: e.target.value ? Number(e.target.value) : undefined })} /></label>
          </div>
          <label className="text-[13px] font-semibold">Included (one per line)<textarea rows={3} className={area} value={text.inclusions} onChange={(e) => setText({ ...text, inclusions: e.target.value })} /></label>
          <label className="text-[13px] font-semibold">Not included<textarea rows={3} className={area} value={text.exclusions} onChange={(e) => setText({ ...text, exclusions: e.target.value })} /></label>
          <label className="text-[13px] font-semibold">What to bring<textarea rows={3} className={area} value={text.bring} onChange={(e) => setText({ ...text, bring: e.target.value })} /></label>
          <label className="text-[13px] font-semibold">Restrictions<textarea rows={3} className={area} value={text.restrictions} onChange={(e) => setText({ ...text, restrictions: e.target.value })} /></label>
          <label className="text-[13px] font-semibold sm:col-span-2">Cancellation and refund policy<textarea rows={2} className={area} value={v.cancellation ?? ""} onChange={(e) => set("cancellation", e.target.value)} /></label>
        </section>

        <section className="flex flex-col gap-4 rounded-[24px] border border-line bg-card p-5">
          <h2 className="text-[15px] font-bold">Dates and tickets</h2>
          <Err p="sessions" />
          {v.sessions.map((s, si) => {
            const reserved = s.id ? (reservedBySession[s.id] ?? 0) : 0;
            return (
              <div key={s.id ?? si} className={`rounded-[18px] border p-4 ${s.cancelled ? "border-dashed border-ivory/20 opacity-70" : "border-ivory/15"}`}>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="text-[13px] font-semibold">Date<input type="date" className={input} value={s.date} disabled={reserved > 0} onChange={(e) => updateSession(si, { date: e.target.value })} /></label>
                  <label className="text-[13px] font-semibold">Start<input type="time" className={input} value={s.time} disabled={reserved > 0} onChange={(e) => updateSession(si, { time: e.target.value })} /></label>
                  {reserved > 0 ? (
                    <label className="flex min-h-11 items-center gap-2 text-[13px]">
                      <input type="checkbox" checked={!!s.cancelled} onChange={(e) => updateSession(si, { cancelled: e.target.checked })} className="size-5 accent-[var(--color-citron)]" /> Cancel this date ({reserved} reserved)
                    </label>
                  ) : (
                    <button type="button" onClick={() => set("sessions", v.sessions.filter((_, j) => j !== si))} disabled={v.sessions.length === 1} className="h-11 rounded-full border border-ivory/25 px-4 text-[13px] font-semibold disabled:opacity-30">Remove date</button>
                  )}
                </div>
                <table className="mt-3 w-full text-[13px]">
                  <thead><tr className="text-left text-muted"><th className="pb-1 font-semibold">Ticket type</th><th className="pb-1 font-semibold">Price ({city?.currency})</th><th className="pb-1 font-semibold">Capacity</th><th className="sr-only">Actions</th></tr></thead>
                  <tbody>
                    {s.tiers.map((t, ti) => (
                      <tr key={t.id ?? ti}>
                        <td className="pr-2"><input aria-label="Ticket type name" className={input} value={t.name} readOnly={!!v.seatLayout} onChange={(e) => updateTier(si, ti, { name: e.target.value })} /></td>
                        <td className="pr-2"><input aria-label="Price" type="number" min={0} className={input} value={t.price} onChange={(e) => updateTier(si, ti, { price: Number(e.target.value) })} /></td>
                        <td className="pr-2"><input aria-label="Capacity" type="number" min={1} className={input} value={t.capacity} readOnly={!!v.seatLayout} onChange={(e) => updateTier(si, ti, { capacity: Number(e.target.value) })} /></td>
                        <td><button type="button" aria-label={`Remove ${t.name || "ticket type"}`} disabled={s.tiers.length === 1 || !!v.seatLayout} onClick={() => updateSession(si, { tiers: s.tiers.filter((_, j) => j !== ti) })} className="mt-1 size-11 rounded-full border border-ivory/20 disabled:opacity-30">×</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!v.seatLayout && <button type="button" onClick={() => updateSession(si, { tiers: [...s.tiers, { name: "", price: 0, capacity: 10 }] })} className="mt-2 h-10 rounded-full border border-ivory/25 px-3 text-[13px] font-semibold">Add ticket type</button>}
              </div>
            );
          })}
          <button type="button" onClick={() => { const last = v.sessions.at(-1)!; set("sessions", [...v.sessions, { date: last.date, time: last.time, tiers: last.tiers.map((t) => ({ name: t.name, price: t.price, capacity: t.capacity })) }]); }} className="h-11 self-start rounded-full border border-ivory/25 px-4 text-[14px] font-semibold">Add another date</button>
          <p className="text-[12px] text-muted">Dates with reservations can&apos;t be moved or deleted, and capacity can&apos;t go below seats already reserved.</p>
        </section>
      </fieldset>

      {error && <p role="alert" className="rounded-[16px] border border-citron/40 p-3 text-[14px] font-semibold text-citron">{error}</p>}
      {!readOnly && (
        <div className="sticky bottom-4 z-10 flex flex-wrap gap-2 rounded-[20px] border border-line bg-card/95 p-3 backdrop-blur">
          <button type="button" onClick={() => submit("draft")} disabled={saving} className="h-12 rounded-full border border-ivory/25 px-5 font-semibold">{saving ? "Saving…" : "Save as draft"}</button>
          <button type="button" onClick={() => submit("published")} disabled={saving} className="h-12 flex-1 rounded-full bg-citron px-5 font-bold text-ink">{v.status === "published" ? "Save and keep published" : "Publish"}</button>
        </div>
      )}
    </form>
  );
}
