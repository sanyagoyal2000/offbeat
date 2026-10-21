"use client";

import Link from "next/link";
import { useState } from "react";
import { UsersIcon } from "../icons";
import { Dialog } from "../Dialog";
import { NewBoardForm } from "./BoardActions";

/** Add an event to one of your boards, or start a new board with it. */
export function AddToBoard({ eventId, boards }: { eventId: string; boards: { id: string; name: string; has: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<Record<string, boolean>>(Object.fromEntries(boards.map((b) => [b.id, b.has])));
  const add = async (id: string) => {
    const res = await fetch(`/api/boards/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "add", eventId }) });
    if (res.ok) setAdded((a) => ({ ...a, [id]: true }));
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="flex h-12 items-center gap-2 rounded-full border border-citron/40 px-5 text-[15px] font-semibold text-citron">
        <UsersIcon size={19} /> Plan with friends
      </button>
      <Dialog open={open} title="Plan this with friends" onClose={() => setOpen(false)}>
        <p className="mb-4 text-[14px] leading-relaxed text-ivory/80">Add this event to a shared board, invite friends and vote on what to do together.</p>
        {boards.length > 0 && (
          <ul className="mb-4 flex flex-col gap-2">
            {boards.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 rounded-[14px] border border-ivory/15 px-3 py-2">
                <Link href={`/boards/${b.id}`} className="truncate text-[14px] font-semibold hover:text-citron">{b.name}</Link>
                <button type="button" disabled={added[b.id]} onClick={() => add(b.id)} className="h-10 flex-none rounded-full border border-ivory/25 px-3 text-[13px] font-semibold disabled:border-citron disabled:text-citron">
                  {added[b.id] ? "Added" : "Add"}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mb-2 text-[13px] text-muted">Start a new group plan with this event. You can invite friends next.</p>
        <NewBoardForm eventId={eventId} compact />
      </Dialog>
    </>
  );
}
