"use client";

import { useState } from "react";

/** Saves the current search to the visitor's Saved page. No external alerts are sent. */
export function SaveSearchButton({ label, query, cityId, cityName }: { label: string; query: string; cityId: string; cityName: string }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const save = async () => {
    setState("saving");
    try {
      const res = await fetch("/api/saved-searches", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label, query, cityId, cityName }) });
      setState(res.ok ? "saved" : "error");
    } catch {
      setState("error");
    }
  };
  return (
    <button
      type="button"
      onClick={save}
      disabled={state === "saving" || state === "saved"}
      className="flex h-11 items-center rounded-full border border-ivory/25 px-5 text-[14px] font-semibold disabled:opacity-70"
      aria-live="polite"
    >
      {state === "saved" ? "Search saved to Saved" : state === "saving" ? "Saving…" : state === "error" ? "Couldn't save, retry" : "Save this search"}
    </button>
  );
}
