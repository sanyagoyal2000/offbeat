"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CloseIcon, SearchIcon } from "@/components/icons";

type Interest = { id: string; name: string; type: string; image?: string; detail?: string };
type Note = { text: string };
type Vibe = { status: "ok" | "unavailable" | "none"; tags: string[] };
const TYPES = [
  ["all", "All"],
  ["artist", "Artists"],
  ["movie", "Films & TV"],
  ["book", "Books"],
  ["place", "Places"],
] as const;

export function TasteEditor({ initial, initialVibe, available }: { initial: { interests: Interest[]; notes: Note[] }; initialVibe: Vibe; available: boolean }) {
  const router = useRouter();
  const [interests, setInterests] = useState(initial.interests);
  const [notes, setNotes] = useState(initial.notes);
  const [vibe, setVibe] = useState(initialVibe);
  const [q, setQ] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number][0]>("all");
  const [results, setResults] = useState<Interest[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "unavailable" | "done">(available ? "idle" : "unavailable");
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [retry, setRetry] = useState(0);
  const seq = useRef(0);
  const first = useRef(true);

  useEffect(() => {
    if (!available || q.trim().length < 2) {
      setResults([]);
      if (available) setStatus("idle");
      return;
    }
    const id = ++seq.current;
    setStatus("loading");
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/qloo/search?q=${encodeURIComponent(q.trim())}&type=${type}`);
        if (id !== seq.current) return;
        if (res.status === 503) return setStatus("unavailable");
        if (!res.ok) throw new Error();
        const body = (await res.json()) as { results: Interest[] };
        setResults(body.results);
        setStatus("done");
      } catch {
        if (id === seq.current) setStatus("error");
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q, type, available, retry]);

  // Persist every change so interests survive refreshes and other devices on the same browser.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSave("saving");
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/taste", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ interests, notes }) });
        if (!res.ok) throw new Error();
        const body = (await res.json()) as { vibe: Vibe };
        setVibe(body.vibe);
        setSave("saved");
      } catch {
        setSave("error");
      }
    }, 300);
    return () => clearTimeout(t);
  }, [interests, notes]);

  const add = (i: Interest) => {
    if (!interests.some((x) => x.id === i.id)) setInterests([...interests, i]);
    setQ("");
  };

  return (
    <div className="mt-5 flex flex-col gap-5">
      <section aria-labelledby="mine-h">
        <h2 id="mine-h" className="text-[15px] font-bold">Your interests</h2>
        {interests.length === 0 && notes.length === 0 ? (
          <p className="mt-1 text-[14px] text-muted">None yet. Even one or two help.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {interests.map((i) => (
              <li key={i.id} className="flex h-11 items-center gap-2 rounded-full bg-citron pl-1 pr-1 text-[14px] font-semibold text-ink">
                {i.image ? <Image src={i.image} alt="" width={36} height={36} unoptimized className="size-9 rounded-full object-cover" /> : <span className="w-2" />}
                {i.name}
                <button type="button" aria-label={`Remove ${i.name}`} onClick={() => setInterests(interests.filter((x) => x.id !== i.id))} className="flex size-9 items-center justify-center rounded-full hover:bg-ink/10">
                  <CloseIcon size={14} />
                </button>
              </li>
            ))}
            {notes.map((n) => (
              <li key={n.text} className="flex h-11 items-center gap-1 rounded-full border border-dashed border-citron/60 pl-4 pr-1 text-[14px] text-citron">
                {n.text} <span className="text-muted">(note, not used for ranking)</span>
                <button type="button" aria-label={`Remove note ${n.text}`} onClick={() => setNotes(notes.filter((x) => x.text !== n.text))} className="flex size-9 items-center justify-center rounded-full">
                  <CloseIcon size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[12px] text-muted" aria-live="polite">
          {save === "saving" ? "Saving…" : save === "saved" ? "Saved" : save === "error" ? "Couldn't save your changes. They'll retry on your next edit." : ""}
        </p>
      </section>

      <section aria-labelledby="add-h" className="rounded-[24px] border border-line bg-card p-5">
        <h2 id="add-h" className="text-[15px] font-bold">Add an interest</h2>
        <div className="no-scrollbar -mx-1 mt-2 flex gap-2 overflow-x-auto px-1" role="radiogroup" aria-label="Type">
          {TYPES.map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={type === k} onClick={() => setType(k)} className={`h-10 flex-none rounded-full px-4 text-[13px] font-semibold ${type === k ? "bg-ivory text-ink" : "border border-ivory/20"}`}>
              {label}
            </button>
          ))}
        </div>
        <label className="mt-3 flex h-12 items-center gap-2 rounded-full border border-ivory/20 bg-ink px-4">
          <SearchIcon size={18} className="text-muted" />
          <span className="sr-only">Search for an artist, film, book or place</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} disabled={!available} placeholder={available ? "Search, e.g. Norah Jones, The Lunchbox" : "Interest search is unavailable"} className="min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-muted focus:outline-none" />
        </label>
        <div aria-live="polite" className="mt-3">
          {status === "loading" && <p className="text-[14px] text-muted">Searching…</p>}
          {status === "unavailable" && <p className="text-[14px] text-muted">Interest search is unavailable right now, so events are shown without taste ordering. You can still keep a note below.</p>}
          {status === "error" && (
            <p className="text-[14px] text-muted">
              Search failed. <button type="button" className="font-semibold text-citron" onClick={() => setRetry((r) => r + 1)}>Retry</button>
            </p>
          )}
          {status === "done" && results.length === 0 && <p className="text-[14px] text-muted">No matches for “{q}”.</p>}
          {results.length > 0 && (
            <ul className="flex flex-col gap-1">
              {results.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => add(r)} disabled={interests.some((x) => x.id === r.id)} className="flex min-h-14 w-full items-center gap-3 rounded-[14px] px-2 text-left hover:bg-raised disabled:opacity-50">
                    {r.image ? <Image src={r.image} alt="" width={44} height={44} unoptimized className="size-11 flex-none rounded-[10px] object-cover" /> : <span className="size-11 flex-none rounded-[10px] bg-raised" />}
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold">{r.name}</span>
                      <span className="block truncate text-[12px] text-muted">{r.detail || r.type}</span>
                    </span>
                    <span className="ml-auto flex-none text-[13px] font-semibold text-citron">{interests.some((x) => x.id === r.id) ? "Added" : "Add"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q.trim().length >= 2 && status !== "loading" && (
            <button
              type="button"
              onClick={() => {
                if (!notes.some((n) => n.text === q.trim())) setNotes([...notes, { text: q.trim().slice(0, 80) }]);
                setQ("");
              }}
              className="mt-2 h-10 rounded-full border border-dashed border-ivory/30 px-4 text-[13px] font-semibold"
            >
              None of these: keep “{q.trim()}” as a note
            </button>
          )}
        </div>
      </section>

      <section aria-labelledby="vibe-h" className="rounded-[24px] border border-line bg-card p-5">
        <h2 id="vibe-h" className="text-[15px] font-bold">Your taste so far</h2>
        {vibe.status === "ok" ? (
          <>
            <ul className="mt-2 flex flex-wrap gap-2">
              {vibe.tags.map((t) => <li key={t} className="rounded-full border border-ivory/20 px-3 py-1 text-[13px]">{t}</li>)}
            </ul>
            <p className="mt-2 text-[12px] text-muted">Genre tags Qloo associates with your interests.</p>
          </>
        ) : (
          <p className="mt-1 text-[14px] text-muted">
            {interests.length === 0 ? "Add an interest to see related styles." : vibe.status === "unavailable" ? "Taste tags are unavailable right now." : "Qloo didn't return genre tags for these interests."}
          </p>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href="/?sort=relevance" className="flex h-12 items-center rounded-full bg-citron px-6 font-bold text-ink">
          {interests.length ? "See events for me" : "Browse events"}
        </Link>
        <button
          type="button"
          onClick={async () => {
            await fetch("/api/taste", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ interests, notes, skipped: true }) });
            router.push("/");
          }}
          className="h-12 rounded-full border border-ivory/25 px-6 font-semibold"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
