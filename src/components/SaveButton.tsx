"use client";

import { useState } from "react";
import { BookmarkFilledIcon, BookmarkIcon } from "./icons";

export function SaveButton({ eventId, title, initial, variant = "icon" }: { eventId: string; title: string; initial: boolean; variant?: "icon" | "pill" }) {
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const toggle = async () => {
    const next = !saved;
    setSaved(next);
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/saved", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventId, saved: next }) });
      if (!res.ok) throw new Error();
    } catch {
      setSaved(!next);
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const label = saved ? `Remove ${title} from saved` : `Save ${title}`;
  if (variant === "pill")
    return (
      <button type="button" onClick={toggle} disabled={busy} aria-pressed={saved} className={`flex h-12 items-center gap-2 rounded-full border px-5 text-[15px] font-semibold ${saved ? "border-citron bg-citron/10 text-citron" : "border-ivory/25"}`}>
        {saved ? <BookmarkFilledIcon size={18} /> : <BookmarkIcon size={18} />}
        {error ? "Couldn't save, retry" : saved ? "Saved" : "Save"}
      </button>
    );
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      aria-label={error ? `${label} (last attempt failed, try again)` : label}
      className={`flex size-11 items-center justify-center rounded-full backdrop-blur transition-colors ${saved ? "bg-citron text-ink" : "bg-ink/70 text-ivory hover:text-citron"}`}
    >
      {saved ? <BookmarkFilledIcon size={18} /> : <BookmarkIcon size={18} />}
    </button>
  );
}
