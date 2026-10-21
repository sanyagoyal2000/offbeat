"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/organizer/auth/logout", { method: "POST" });
        router.replace("/organizer/login");
        router.refresh();
      }}
      className="h-11 rounded-full border border-ivory/25 px-4 text-[14px] font-semibold"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}

export function OrgProfileForm({ name, about, cityId, cities }: { name: string; about: string; cityId: string; cities: { id: string; name: string }[] }) {
  const router = useRouter();
  const [f, setF] = useState({ name, about, cityId });
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await fetch("/api/organizer/org", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
        setMsg(res.ok ? "Saved" : "Couldn't save");
        router.refresh();
      }}
    >
      <label className="text-[13px] font-semibold">Organization name<input className="mt-1 h-11 w-full rounded-[12px] border border-ivory/20 bg-ink px-3" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label className="text-[13px] font-semibold">Home city
        <select className="mt-1 h-11 w-full rounded-[12px] border border-ivory/20 bg-ink px-3" value={f.cityId} onChange={(e) => setF({ ...f, cityId: e.target.value })}>
          {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <button type="submit" className="h-11 rounded-full bg-citron px-5 font-bold text-ink">Save</button>
      <label className="text-[13px] font-semibold sm:col-span-3">About<input className="mt-1 h-11 w-full rounded-[12px] border border-ivory/20 bg-ink px-3" value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} /></label>
      <span aria-live="polite" className="text-[12px] text-muted">{msg}</span>
    </form>
  );
}
