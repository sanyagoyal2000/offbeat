"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const input = "mt-1 h-12 w-full rounded-[14px] border border-ivory/20 bg-card px-4 text-[15px]";

export function AuthForm({ mode, next, cities, defaultCity }: { mode: "login" | "signup"; next: string; cities?: { id: string; name: string }[]; defaultCity?: string }) {
  const router = useRouter();
  const [f, setF] = useState({ name: "", orgName: "", cityId: defaultCity ?? "", email: "", password: "" });
  const [error, setError] = useState<{ msg: string; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = mode === "login" ? { email: f.email, password: f.password } : f;
      const res = await fetch(`/api/organizer/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) {
        setError({ msg: json.error ?? "Something went wrong", field: json.field });
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError({ msg: "Network problem. Try again." });
    } finally {
      setBusy(false);
    }
  };

  const err = (field: string) => (error?.field === field ? <span role="alert" className="mt-1 block text-[12px] font-semibold text-citron">{error.msg}</span> : null);
  return (
    <form onSubmit={submit} className="mt-5 flex flex-col gap-4" noValidate>
      {mode === "signup" && (
        <>
          <label className="text-[13px] font-semibold">Your name<input autoComplete="name" className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />{err("name")}</label>
          <label className="text-[13px] font-semibold">Organization or venue name<input autoComplete="organization" className={input} value={f.orgName} onChange={(e) => setF({ ...f, orgName: e.target.value })} required />{err("orgName")}</label>
          <label className="text-[13px] font-semibold">Home city
            <select className={input} value={f.cityId} onChange={(e) => setF({ ...f, cityId: e.target.value })}>
              {cities?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {err("cityId")}
          </label>
        </>
      )}
      <label className="text-[13px] font-semibold">Email<input type="email" autoComplete="email" className={input} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />{err("email")}</label>
      <label className="text-[13px] font-semibold">Password
        <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} className={input} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={mode === "signup" ? 10 : 1} />
        {mode === "signup" && <span className="mt-1 block text-[12px] text-muted">At least 10 characters.</span>}
        {err("password")}
      </label>
      {error && !error.field && <p role="alert" className="text-[14px] font-semibold text-citron">{error.msg}</p>}
      <button type="submit" disabled={busy} className="h-12 rounded-full bg-citron font-bold text-ink disabled:opacity-60">
        {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
      </button>
    </form>
  );
}
