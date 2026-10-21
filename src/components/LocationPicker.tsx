"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { locationLabel, type Location } from "@/lib/locations";
import { Dialog } from "./Dialog";
import { ChevronDownIcon, PinIcon, SearchIcon } from "./icons";

type Result = Location & { hasEvents: boolean };

/** Searchable worldwide city picker. `kind` picks which saved location it changes. */
export function LocationPicker({
  current,
  kind = "explore",
  variant = "header",
  onChanged,
  persist = true,
}: {
  current: Location | null;
  kind?: "explore" | "home";
  variant?: "header" | "field";
  onChanged?: (l: Location) => void;
  /** When false, only reports the choice (e.g. a wish's city) without changing saved locations. */
  persist?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [remoteError, setRemoteError] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const id = ++seq.current;
    setState("loading");
    const t = setTimeout(async () => {
      try {
        // Built-in cities first (instant), then merge in worldwide geocoder results.
        const quick = await fetch(`/api/locations?q=${encodeURIComponent(q)}&remote=0`);
        if (!quick.ok) throw new Error();
        const first = (await quick.json()) as { results: Result[] };
        if (id !== seq.current) return;
        setResults(first.results);
        setState(q.trim().length >= 2 ? "loading" : "idle");
        if (q.trim().length < 2) return;
        const res = await fetch(`/api/locations?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error();
        const body = (await res.json()) as { results: Result[]; remoteError: boolean };
        if (id !== seq.current) return;
        setResults(body.results);
        setRemoteError(body.remoteError);
        setState("idle");
      } catch {
        if (id === seq.current) setState("error");
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  const choose = async (l: Location) => {
    setSaving(l.id);
    try {
      if (persist) {
        const res = await fetch("/api/location", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, location: l }) });
        if (!res.ok) throw new Error();
      }
      onChanged?.(l);
      setOpen(false);
      if (persist) router.refresh();
    } catch {
      setState("error");
    } finally {
      setSaving(null);
    }
  };

  const label = kind === "home" ? "Home location" : "Exploring";
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setQ("");
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-label={`${label}: ${current ? locationLabel(current) : "not set"}. Change`}
        className={
          variant === "header"
            ? "flex h-10 min-w-0 items-center gap-1.5 rounded-full px-2 text-[14px] font-semibold hover:bg-card"
            : "flex min-h-12 w-full items-center gap-2 rounded-[16px] border border-ivory/20 bg-ink px-4 text-left text-[15px]"
        }
      >
        <PinIcon size={17} className="flex-none text-citron" />
        <span className="truncate">{current ? (variant === "header" ? current.name : locationLabel(current)) : "Choose a city"}</span>
        <ChevronDownIcon size={15} className="flex-none text-muted" />
      </button>
      <Dialog open={open} title={kind === "home" ? "Set your home location" : "Where do you want to explore?"} onClose={() => setOpen(false)}>
        <label className="flex h-12 items-center gap-2 rounded-full border border-ivory/20 bg-ink px-4">
          <SearchIcon size={18} className="text-muted" />
          <span className="sr-only">Search cities</span>
          <input
            data-autofocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search any city"
            className="min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-muted focus:outline-none"
          />
        </label>
        <p className="mt-2 text-[12px] text-muted">Sample listings exist in Bengaluru, London and New York. Other cities may have no events yet.</p>
        <div aria-live="polite" className="mt-3">
          {state === "loading" && <p className="py-2 text-center text-[13px] text-muted">{results.length ? "Searching worldwide…" : "Searching…"}</p>}
          {state === "error" && (
            <p className="py-4 text-center text-[14px] text-muted">
              Couldn&apos;t search right now.{" "}
              <button type="button" className="font-semibold text-citron" onClick={() => setQ((x) => `${x} `.trimEnd())}>
                Retry
              </button>
            </p>
          )}
          {state !== "error" && results.length === 0 && state === "idle" && <p className="py-4 text-center text-[14px] text-muted">No cities match “{q}”.</p>}
          <ul className="flex flex-col">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => choose(r)}
                  disabled={!!saving}
                  className="flex min-h-14 w-full items-center justify-between gap-3 rounded-[14px] px-3 text-left hover:bg-raised"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold">{r.name}</span>
                    <span className="block truncate text-[12px] text-muted">{[r.region, r.country].filter(Boolean).join(", ")} · {r.timezone}</span>
                  </span>
                  <span className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-semibold ${r.hasEvents ? "bg-citron/15 text-citron" : "text-muted"}`}>
                    {saving === r.id ? "Saving…" : r.hasEvents ? "Sample events" : "No listings yet"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {remoteError && <p className="mt-2 text-[12px] text-muted">Worldwide search is unavailable; showing built-in cities only.</p>}
        </div>
      </Dialog>
    </>
  );
}
