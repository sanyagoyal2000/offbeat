"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewExperiment({ eventId, canConnected }: { eventId: string; canConnected: boolean }) {
  const router = useRouter();
  const [audience, setAudience] = useState<"city" | "connected">("city");
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-[13px] font-semibold">Audience
        <select value={audience} onChange={(e) => setAudience(e.target.value as "city" | "connected")} className="mt-1 h-11 rounded-full border border-ivory/20 bg-ink px-3 text-[14px]">
          <option value="city">Everyone exploring this city</option>
          <option value="connected" disabled={!canConnected}>Taste-connected visitors{canConnected ? "" : " (needs audience estimate)"}</option>
        </select>
      </label>
      <button
        type="button"
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy");
          setMsg(null);
          const res = await fetch("/api/organizer/experiments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventId, audience }) });
          const json = await res.json();
          if (!res.ok) {
            setState("error");
            setMsg(json.error ?? "Couldn't create drafts");
            return;
          }
          setState("idle");
          router.refresh();
        }}
        className="h-11 rounded-full bg-citron px-5 font-bold text-ink disabled:opacity-60"
      >
        {state === "busy" ? "Drafting variants…" : "Draft promo variants"}
      </button>
      {msg && <p role="alert" className="w-full text-[13px] text-citron">{msg}</p>}
      {state === "busy" && <p className="w-full text-[12px] text-muted" aria-live="polite">Writing 4 factual variants. This can take up to a minute.</p>}
    </div>
  );
}

export function ExperimentAction({ id, action, label, primary = false }: { id: string; action: "start" | "stop" | "simulate"; label: string; primary?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch(`/api/organizer/experiments/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
        router.refresh();
        setBusy(false);
      }}
      className={`h-10 rounded-full px-4 text-[13px] font-bold ${primary ? "bg-citron text-ink" : action === "simulate" ? "border border-dashed border-citron/60 text-citron" : "border border-ivory/25"}`}
    >
      {busy ? "Working…" : label}
    </button>
  );
}
