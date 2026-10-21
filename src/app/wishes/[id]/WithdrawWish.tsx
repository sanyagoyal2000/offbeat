"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function WithdrawWish({ id, reopen = false }: { id: string; reopen?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch(`/api/wishes/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: reopen ? "open" : "withdrawn" }) });
        router.refresh();
        setBusy(false);
      }}
      className={reopen ? "font-semibold text-citron underline underline-offset-4" : "h-11 rounded-full border border-ivory/25 px-5 text-[14px] font-semibold"}
    >
      {busy ? "Saving…" : reopen ? "Reopen it" : "Withdraw this wish"}
    </button>
  );
}
