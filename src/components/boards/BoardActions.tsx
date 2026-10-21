"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { UsersIcon, PlusIcon, ThumbUpIcon } from "../icons";

async function post(boardId: string, body: unknown) {
  const res = await fetch(`/api/boards/${boardId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Something went wrong");
}

export function VoteButton({ boardId, eventId, voted, count, title }: { boardId: string; eventId: string; voted: boolean; count: number; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      aria-pressed={voted}
      aria-label={`${voted ? "Remove your vote for" : "Vote for"} ${title} (${count} vote${count === 1 ? "" : "s"})`}
      onClick={async () => {
        setBusy(true);
        setErr(false);
        try {
          await post(boardId, { action: "vote", eventId, on: !voted });
          router.refresh();
        } catch {
          setErr(true);
        } finally {
          setBusy(false);
        }
      }}
      className={`flex h-11 items-center gap-2 rounded-full px-4 text-[14px] font-bold ${voted ? "bg-citron text-ink" : "border border-ivory/25"}`}
    >
      <ThumbUpIcon size={17} />
      <span className="tnum">{count}</span>
      {err && <span className="text-[12px]">retry</span>}
    </button>
  );
}

export function BoardItemAction({ boardId, eventId, action, label }: { boardId: string; eventId: string; action: "add" | "remove"; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await post(boardId, { action, eventId });
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className="flex h-10 items-center gap-1.5 rounded-full border border-ivory/25 px-3 text-[13px] font-semibold"
    >
      {action === "add" ? <PlusIcon size={15} /> : null}
      {busy ? "…" : label}
    </button>
  );
}

export function MyConstraintsForm({ boardId, initial, currency }: { boardId: string; initial: { name?: string; budgetMax?: number; from?: string; to?: string }; currency: string }) {
  const router = useRouter();
  const [f, setF] = useState({ name: initial.name ?? "", budget: initial.budgetMax?.toString() ?? "", from: initial.from ?? "", to: initial.to ?? "" });
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState("saving");
    try {
      await post(boardId, {
        action: "me",
        me: { name: f.name || undefined, budgetMax: f.budget ? Number(f.budget) : undefined, from: f.from || undefined, to: f.to || undefined },
      });
      setState("saved");
      router.refresh();
    } catch {
      setState("error");
    }
  };
  const input = "mt-1 h-11 w-full rounded-[12px] border border-ivory/20 bg-ink px-3 text-[14px]";
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <label className="text-[13px] font-semibold">Your name (optional)<input className={input} value={f.name} maxLength={40} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label className="text-[13px] font-semibold">Max per person ({currency}, incl. fees)<input className={input} inputMode="decimal" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value.replace(/[^\d.]/g, "") })} /></label>
      <label className="text-[13px] font-semibold">Free from<input type="date" className={input} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
      <label className="text-[13px] font-semibold">Free until<input type="date" className={input} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={state === "saving"} className="h-11 rounded-full bg-citron px-5 font-bold text-ink">{state === "saving" ? "Saving…" : "Save my details"}</button>
        <span aria-live="polite" className="text-[13px] text-muted">{state === "saved" ? "Saved. Everyone on the board sees it." : state === "error" ? "Couldn't save, try again." : "All fields are optional."}</span>
      </div>
    </form>
  );
}

export function RenameBoard({ boardId, name }: { boardId: string; name: string }) {
  const router = useRouter();
  const [v, setV] = useState(name);
  const [editing, setEditing] = useState(false);
  if (!editing)
    return (
      <button type="button" onClick={() => setEditing(true)} className="h-9 rounded-full px-3 text-[13px] font-semibold text-muted underline underline-offset-4">
        Rename
      </button>
    );
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        await post(boardId, { action: "rename", name: v });
        setEditing(false);
        router.refresh();
      }}
    >
      <label className="sr-only" htmlFor="board-name">Board name</label>
      <input id="board-name" value={v} maxLength={60} onChange={(e) => setV(e.target.value)} className="h-10 rounded-full border border-ivory/20 bg-ink px-3 text-[14px]" />
      <button type="submit" className="h-10 rounded-full bg-citron px-4 text-[13px] font-bold text-ink">Save</button>
    </form>
  );
}

export function NewBoardForm({ eventId, compact = false }: { eventId?: string; compact?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("saving");
        try {
          const res = await fetch("/api/boards", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name || "Our plans", eventId }) });
          const body = (await res.json()) as { board?: { id: string } };
          if (!res.ok || !body.board) throw new Error();
          router.push(`/boards/${body.board.id}`);
        } catch {
          setState("error");
        }
      }}
    >
      <label className="sr-only" htmlFor={`new-board-${eventId ?? "x"}`}>Group plan name (optional)</label>
      <input id={`new-board-${eventId ?? "x"}`} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Name it, or leave blank" className={`h-11 w-full min-w-0 flex-none rounded-full sm:w-auto sm:flex-1 border border-ivory/20 bg-ink px-4 text-[14px] ${compact ? "" : "sm:max-w-sm"}`} />
      <button type="submit" disabled={state === "saving"} className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-citron px-5 text-[14px] font-bold text-ink">
        <UsersIcon size={16} /> {state === "saving" ? "Creating…" : "Start a group plan"}
      </button>
      {state === "error" && <p role="alert" className="w-full text-[13px] text-citron">Couldn&apos;t create the board. Try again.</p>}
    </form>
  );
}

export function CopyLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`${window.location.origin}${path}`);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch {}
      }}
      className="h-11 rounded-full border border-ivory/25 px-4 text-[14px] font-semibold"
      aria-live="polite"
    >
      {copied ? "Invite link copied" : "Invite friends · copy link"}
    </button>
  );
}
