"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckIcon, CloseIcon, PlusIcon, SearchIcon } from "@/components/icons";
import { TABS, TYPE_LABEL, type Suggestion, type TabKey } from "@/lib/suggestions";
import type { TasteSuggestions } from "@/lib/server/suggestions";

type Interest = { id: string; name: string; type: string; image?: string; detail?: string };
type Note = { text: string };
type Vibe = { status: "ok" | "unavailable" | "none"; tags: string[] };
type Related = Suggestion & { because: string | null };

const MAX = 10; // also enforced on the server (user_anchors)
const toInterest = (s: Suggestion): Interest => ({ id: s.id, name: s.name, type: s.type, ...(s.image ? { image: s.image } : {}) });

/** One tappable interest: a real toggle button (aria-pressed) with a lazy image and a neutral placeholder. */
function InterestCard({ s, added, disabled, onToggle, size = "grid", note }: { s: Suggestion; added: boolean; disabled: boolean; onToggle: () => void; size?: "grid" | "row"; note?: string }) {
  return (
    <button
      type="button"
      aria-pressed={added}
      aria-disabled={disabled || undefined}
      onClick={() => !disabled && onToggle()}
      className={`group relative flex min-h-11 flex-col gap-1.5 rounded-[16px] p-1.5 text-left transition ${added ? "bg-citron/15 ring-1 ring-citron" : "hover:bg-raised"} ${disabled ? "opacity-50" : ""} ${size === "row" ? "w-28" : "w-full"}`}
    >
      <span className="relative block aspect-square w-full overflow-hidden rounded-[12px] bg-raised">
        {s.image && <Image src={s.image} alt="" fill sizes="(max-width: 640px) 33vw, 160px" loading="lazy" unoptimized className="object-cover" />}
        <span aria-hidden="true" className={`absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full shadow ${added ? "bg-ink text-citron" : "bg-citron text-ink"}`}>
          {added ? <CheckIcon size={15} /> : <PlusIcon size={15} />}
        </span>
      </span>
      <span className="line-clamp-2 break-words text-[13px] font-semibold leading-tight [overflow-wrap:anywhere]">{s.name}</span>
      <span className="text-[11px] text-muted">{TYPE_LABEL[s.type] ?? s.type}{note ? ` · ${note}` : ""}</span>
      <span className="sr-only">{added ? ", added" : disabled ? `, you can add up to ${MAX}` : ", add"}</span>
    </button>
  );
}

export function TasteEditor({ initial, initialVibe, available, suggestions }: { initial: { interests: Interest[]; notes: Note[] }; initialVibe: Vibe; available: boolean; suggestions: TasteSuggestions }) {
  const router = useRouter();
  const [interests, setInterests] = useState(initial.interests);
  const [notes, setNotes] = useState(initial.notes);
  const [vibe, setVibe] = useState(initialVibe);
  const [tab, setTab] = useState<TabKey>("for-you");
  const [q, setQ] = useState("");
  const [noteText, setNoteText] = useState("");
  const [results, setResults] = useState<Interest[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "unavailable" | "done">(available ? "idle" : "unavailable");
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [related, setRelated] = useState<{ state: "idle" | "loading" | "ok" | "unavailable"; items: Related[] }>({ state: "idle", items: [] });
  const [retry, setRetry] = useState(0);
  const seq = useRef(0);
  const relSeq = useRef(0);
  const first = useRef(true);

  const picked = new Set(interests.map((i) => i.id));
  const full = interests.length >= MAX;
  const toggle = (i: Interest) => {
    if (picked.has(i.id)) setInterests(interests.filter((x) => x.id !== i.id));
    else if (!full) setInterests([...interests, i]);
  };

  // Typeahead (search follows the selected tab's type).
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
        const res = await fetch(`/api/qloo/search?q=${encodeURIComponent(q.trim())}&type=${tab === "for-you" ? "all" : tab}`);
        if (id !== seq.current) return;
        if (res.status === 503) return setStatus("unavailable");
        if (!res.ok) throw new Error();
        setResults(((await res.json()) as { results: Interest[] }).results);
        setStatus("done");
      } catch {
        if (id === seq.current) setStatus("error");
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q, tab, available, retry]);

  // Persist every change so interests survive refreshes.
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
        setVibe(((await res.json()) as { vibe: Vibe }).vibe);
        setSave("saved");
      } catch {
        setSave("error");
      }
    }, 300);
    return () => clearTimeout(t);
  }, [interests, notes]);

  // More like this: live Qloo Insights seeded by every pick (cached server-side).
  const anchorKey = interests.map((i) => i.id).join(",");
  useEffect(() => {
    if (!available || !interests.length) return setRelated({ state: "idle", items: [] });
    const id = ++relSeq.current;
    setRelated((r) => ({ ...r, state: "loading" }));
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/taste/related", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ anchors: interests.map(({ id, name, type }) => ({ id, name, type })) }) });
        if (id !== relSeq.current) return;
        if (!res.ok) return setRelated({ state: "unavailable", items: [] });
        setRelated({ state: "ok", items: ((await res.json()) as { items: Related[] }).items });
      } catch {
        if (id === relSeq.current) setRelated({ state: "unavailable", items: [] });
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorKey, available]);

  const view = suggestions.tabs[tab];
  const tabLabel = TABS.find((t) => t.key === tab)!.label;
  const card = (s: Suggestion, size?: "grid" | "row", note?: string) => <InterestCard key={s.id} s={s} size={size} note={note} added={picked.has(s.id)} disabled={full && !picked.has(s.id)} onToggle={() => toggle(toInterest(s))} />;

  return (
    <div className="mt-5 flex flex-col gap-6">
      {/* 1. Search */}
      <section aria-labelledby="search-h">
        <h2 id="search-h" className="sr-only">Search Qloo</h2>
        <label className="flex h-12 items-center gap-2 rounded-full border border-ivory/20 bg-ink px-4">
          <SearchIcon size={18} className="text-muted" />
          <span className="sr-only">Search for an artist, film, show, book, podcast or place</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} disabled={!available} placeholder={available ? "Search, e.g. Norah Jones, Panchayat" : "Interest search is unavailable"} className="min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-muted focus:outline-none" />
          {q && <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="flex size-9 items-center justify-center rounded-full"><CloseIcon size={14} /></button>}
        </label>
        <div aria-live="polite">
          {status === "loading" && <p className="mt-2 text-[14px] text-muted">Searching…</p>}
          {status === "unavailable" && q && <p className="mt-2 text-[14px] text-muted">Interest search is unavailable right now. You can still tap suggestions below or keep a note.</p>}
          {status === "error" && (
            <p className="mt-2 text-[14px] text-muted">Search failed. <button type="button" className="font-semibold text-citron" onClick={() => setRetry((r) => r + 1)}>Retry</button></p>
          )}
          {status === "done" && results.length === 0 && <p className="mt-2 text-[14px] text-muted">No matches for “{q}”. Try another spelling, or keep it as a note below.</p>}
          {results.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 rounded-[20px] border border-line bg-card p-1.5">
              {results.map((r) => (
                <li key={r.id}>
                  <button type="button" aria-pressed={picked.has(r.id)} onClick={() => toggle(r)} disabled={full && !picked.has(r.id)} className="flex min-h-14 w-full items-center gap-3 rounded-[14px] px-2 text-left hover:bg-raised disabled:opacity-50">
                    {r.image ? <Image src={r.image} alt="" width={44} height={44} unoptimized className="size-11 flex-none rounded-[10px] object-cover" /> : <span className="size-11 flex-none rounded-[10px] bg-raised" />}
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold">{r.name}</span>
                      <span className="block truncate text-[12px] text-muted">{r.detail || r.type}</span>
                    </span>
                    <span className="ml-auto flex-none text-[13px] font-semibold text-citron">{picked.has(r.id) ? "Added" : full ? `Max ${MAX}` : "Add"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Chip row + counter */}
      <section aria-labelledby="mine-h">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="mine-h" className="text-[15px] font-bold">Your interests</h2>
          <p className={`tnum text-[13px] ${full ? "font-semibold text-citron" : "text-muted"}`} aria-live="polite">{interests.length} of {MAX}</p>
        </div>
        {interests.length === 0 && notes.length === 0 ? (
          <p className="mt-1 text-[14px] text-muted">None yet. Tap a few below; even two or three help.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {interests.map((i) => (
              <li key={i.id} className="flex h-11 items-center gap-2 rounded-full bg-citron pl-1 pr-1 text-[14px] font-semibold text-ink">
                {i.image ? <Image src={i.image} alt="" width={36} height={36} unoptimized className="size-9 rounded-full object-cover" /> : <span className="w-2" />}
                <span className="max-w-[12rem] truncate">{i.name}</span>
                <button type="button" aria-label={`Remove ${i.name}`} onClick={() => toggle(i)} className="flex size-9 items-center justify-center rounded-full hover:bg-ink/10">
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
        <p className="mt-1 min-h-4 text-[12px] text-muted" aria-live="polite">
          {save === "saving" ? "Saving…" : save === "saved" ? "Saved" : save === "error" ? "Couldn't save your changes. They'll retry on your next edit." : ""}
        </p>

        {/* 5. More like this */}
        {interests.length > 0 && related.state !== "idle" && (
          <div className="mt-2" aria-live="polite">
            <h3 className="text-[13px] font-bold">More like this <span className="font-normal text-muted">· via Qloo</span></h3>
            {related.state === "unavailable" ? (
              <p className="mt-1 text-[13px] text-muted">Related suggestions are unavailable right now.</p>
            ) : related.state === "loading" && !related.items.length ? (
              <p className="mt-1 text-[13px] text-muted">Finding related picks…</p>
            ) : (
              <ul className={`mt-2 grid grid-cols-4 gap-1.5 ${related.state === "loading" ? "opacity-60" : ""}`}>
                {related.items.map((r) => (
                  <li key={r.id} className="flex flex-col">
                    {card(r)}
                    {r.because && <p className="px-1.5 text-[11px] leading-tight text-ivory/70">Because you picked {r.because}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* 2. Category tabs */}
      <section aria-labelledby="browse-h">
        <h2 id="browse-h" className="sr-only">Browse popular interests</h2>
        <div role="tablist" aria-label="Interest categories" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" id={`tab-${t.key}`} aria-selected={tab === t.key} aria-controls="tab-panel" onClick={() => setTab(t.key)} className={`h-11 flex-none rounded-full px-4 text-[14px] font-semibold ${tab === t.key ? "bg-ivory text-ink" : "border border-ivory/20"}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div id="tab-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-4 flex flex-col gap-5">
          {/* 3. Popular in city (Qloo) + starter picks (curated), labelled separately */}
          {view.popular.length > 0 && (
            <div>
              <h3 className="text-[15px] font-bold">Popular in {suggestions.city} <span className="text-[13px] font-normal text-muted">· via Qloo</span></h3>
              <ul className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-4">{view.popular.map((s) => <li key={s.id}>{card(s)}</li>)}</ul>
            </div>
          )}
          {view.starters.length > 0 && (
            <div>
              <h3 className="text-[15px] font-bold">Starter picks</h3>
              <p className="text-[12px] text-muted">A short list we picked to get you started{view.popular.length ? `, added because Qloo's ${tabLabel.toLowerCase()} list for ${suggestions.city} was thin or mostly international` : ""}. Each one is a real Qloo entity.</p>
              <ul className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-4">{view.starters.map((s) => <li key={s.id}>{card(s)}</li>)}</ul>
            </div>
          )}
          {view.popular.length === 0 && view.starters.length === 0 && (
            <p className="text-[14px] text-muted">{suggestions.freshness === "pending" ? `Fetching popular picks for ${suggestions.city} from Qloo. Search above in the meantime.` : "No suggestions for this category yet. Try searching above."}</p>
          )}

          {/* 4. Trending (only when Qloo's trend weighting really changes the list) */}
          {view.trending.length > 0 && (
            <div>
              <h3 className="text-[15px] font-bold">Trending <span className="text-[13px] font-normal text-muted">· via Qloo, trend-weighted</span></h3>
              <ul className="no-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">{view.trending.map((s) => <li key={s.id} className="flex-none">{card(s, "row")}</li>)}</ul>
            </div>
          )}
        </div>
      </section>

      {/* Your vibe so far */}
      <section aria-labelledby="vibe-h" className="rounded-[24px] border border-line bg-card p-5">
        <h2 id="vibe-h" className="text-[15px] font-bold">Your vibe so far</h2>
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

      {/* Couldn't find it */}
      <section aria-labelledby="note-h" className="rounded-[24px] border border-dashed border-ivory/20 p-5">
        <h2 id="note-h" className="text-[15px] font-bold">Couldn&apos;t find something?</h2>
        <p className="mt-1 text-[13px] text-muted">Keep it as a note. Notes stay on your profile but aren&apos;t sent to Qloo or used for ranking.</p>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const t = noteText.trim().slice(0, 80);
            if (t && !notes.some((n) => n.text === t)) setNotes([...notes, { text: t }]);
            setNoteText("");
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">Note</span>
            <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder={q.trim() || "e.g. my friend's band"} className="h-11 w-full rounded-full border border-ivory/20 bg-ink px-4 text-[14px] placeholder:text-muted focus:outline-none" />
          </label>
          <button type="submit" className="h-11 flex-none rounded-full border border-ivory/25 px-4 text-[13px] font-semibold">Keep note</button>
        </form>
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
