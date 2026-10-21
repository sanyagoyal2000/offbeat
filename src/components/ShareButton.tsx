"use client";

import { useState } from "react";
import { ShareIcon } from "./icons";

/** Native share sheet where available, otherwise copies the link. */
export function ShareButton({ title, path, label = "Share" }: { title: string; path: string; label?: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const share = async () => {
    const url = `${window.location.origin}${path}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setMsg("Link copied");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setMsg("Couldn't share. Copy the address bar link instead.");
    }
    setTimeout(() => setMsg(null), 3000);
  };
  return (
    <span className="relative inline-flex">
      <button type="button" onClick={share} className="flex h-12 items-center gap-2 rounded-full border border-ivory/25 px-5 text-[15px] font-semibold">
        <ShareIcon size={18} />
        {label}
      </button>
      <span aria-live="polite" className="absolute left-0 top-full mt-1 whitespace-nowrap text-[12px] text-citron">
        {msg}
      </span>
    </span>
  );
}
