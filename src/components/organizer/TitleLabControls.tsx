"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Action = { action: string; variantId?: string; title?: string; hook?: string };

async function post(eventId: string, body: Action) {
  const res = await fetch("/api/organizer/title-lab", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventId, ...body }) });
  if (res.ok) return null;
  return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Something went wrong.";
}

export function TitleLabButton({ eventId, body, label, busyLabel = "Working…", tone = "plain", note }: { eventId: string; body: Action; label: string; busyLabel?: string; tone?: "primary" | "plain" | "sim" | "quiet"; note?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cls = {
    primary: "h-10 rounded-full bg-citron px-4 text-[13px] font-bold text-ink",
    plain: "h-10 rounded-full border border-ivory/25 px-4 text-[13px] font-semibold",
    sim: "h-10 rounded-full border border-dashed border-citron/60 px-4 text-[13px] font-bold text-citron",
    quiet: "min-h-9 px-2 text-[12px] font-semibold text-citron underline-offset-4 hover:underline",
  }[tone];
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={busy}
        className={`${cls} disabled:opacity-60`}
        onClick={async () => {
          setBusy(true);
          setError(await post(eventId, body));
          setBusy(false);
          router.refresh();
        }}
      >
        {busy ? busyLabel : label}
      </button>
      {busy && note && <span className="text-[12px] text-muted" aria-live="polite">{note}</span>}
      {error && <span role="alert" className="max-w-xs text-[12px] text-citron">{error}</span>}
    </span>
  );
}

/** Inline editor: the edited copy is re-checked (rules + second check) on the server before saving. */
export function VariantEditor({ eventId, variantId, title, hook }: { eventId: string; variantId: string; title: string; hook: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [t, setT] = useState(title);
  const [h, setH] = useState(hook);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="min-h-9 px-2 text-[12px] font-semibold text-citron underline-offset-4 hover:underline">
        Edit
      </button>
    );
  return (
    <form
      className="mt-2 flex w-full flex-col gap-2"
      onSubmit={async (ev) => {
        ev.preventDefault();
        setBusy(true);
        const err = await post(eventId, { action: "edit", variantId, title: t, hook: h });
        setBusy(false);
        setError(err);
        if (!err) {
          setOpen(false);
          router.refresh();
        }
      }}
    >
      <label className="text-[12px] font-semibold">
        Title <span className={`tnum font-normal ${t.length > 60 ? "text-citron" : "text-muted"}`}>{t.length}/60</span>
        <input value={t} onChange={(ev) => setT(ev.target.value)} className="mt-1 h-10 w-full rounded-[12px] border border-ivory/20 bg-ink px-3 text-[14px] font-normal" />
      </label>
      <label className="text-[12px] font-semibold">
        Hook
        <input value={h} onChange={(ev) => setH(ev.target.value)} className="mt-1 h-10 w-full rounded-[12px] border border-ivory/20 bg-ink px-3 text-[14px] font-normal" />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="h-9 rounded-full bg-citron px-4 text-[13px] font-bold text-ink disabled:opacity-60">{busy ? "Checking…" : "Save"}</button>
        <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-full border border-ivory/25 px-4 text-[13px] font-semibold">Cancel</button>
      </div>
      {error && <p role="alert" className="text-[12px] text-citron">Not saved: {error}</p>}
    </form>
  );
}
