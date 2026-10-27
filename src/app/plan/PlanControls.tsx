"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Wraps the planner: shown straight away when you have no plans, otherwise behind "Create a new plan". */
export function PlanWorkspace({ startOpen, children }: { startOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(startOpen);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === "#new-plan") {
        setOpen(true);
        requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return (
    <section id="new-plan" ref={ref} aria-labelledby="new-plan-h" className="scroll-mt-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="new-plan-h" className="font-display text-[18px]">{open ? "New plan" : "Plan something new"}</h2>
        {open ? (
          !startOpen && <button type="button" onClick={() => setOpen(false)} className="h-10 rounded-full px-3 text-[13px] font-semibold text-muted underline underline-offset-4">Hide planner</button>
        ) : (
          <button type="button" aria-expanded={false} aria-controls="planner" onClick={() => setOpen(true)} className="flex h-11 items-center rounded-full bg-citron px-5 text-[14px] font-bold text-ink">+ Create a new plan</button>
        )}
      </div>
      <div id="planner" hidden={!open}>{children}</div>
    </section>
  );
}

export function RemovePlan({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      aria-label={`Remove plan: ${title}`}
      onClick={async () => {
        setBusy(true);
        await fetch(`/api/plans/${id}`, { method: "DELETE" });
        router.refresh();
      }}
      className="flex h-10 items-center rounded-full px-3 text-[13px] font-semibold text-muted underline underline-offset-4"
    >
      {busy ? "Removing…" : "Remove"}
    </button>
  );
}
