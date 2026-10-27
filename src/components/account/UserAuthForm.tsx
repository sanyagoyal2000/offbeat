"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

const input = "mt-1 h-12 w-full rounded-[14px] border border-ivory/20 bg-card px-4 text-[15px]";

/** Attendee log-in / sign-up form (username + password). */
export function UserAuthForm({ mode, next }: { mode: "login" | "signup"; next: string }) {
  const router = useRouter();
  const [f, setF] = useState({ username: "", displayName: "", password: "" });
  const [error, setError] = useState<{ msg: string; field?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = mode === "login" ? { username: f.username, password: f.password } : { username: f.username, displayName: f.displayName || undefined, password: f.password };
      const res = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json()) as { error?: string; field?: string };
      if (!res.ok) return setError({ msg: json.error ?? "Something went wrong", field: json.field });
      router.replace(next);
      router.refresh();
    } catch {
      setError({ msg: "Network problem. Try again." });
    } finally {
      setBusy(false);
    }
  };

  const err = (field: string) => (error?.field === field ? <span role="alert" className="mt-1 block text-[12px] font-semibold text-citron">{error.msg}</span> : null);
  const other = mode === "login" ? "signup" : "login";
  return (
    <>
      <form onSubmit={submit} className="mt-5 flex flex-col gap-4" noValidate>
        <label className="text-[13px] font-semibold">
          Username
          <input autoComplete="username" autoCapitalize="none" spellCheck={false} className={input} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} required />
          {mode === "signup" && <span className="mt-1 block text-[12px] text-muted">3–20 characters: letters, numbers, dots or underscores. Friends see it on shared boards.</span>}
          {err("username")}
        </label>
        {mode === "signup" && (
          <label className="text-[13px] font-semibold">
            Display name <span className="font-normal text-muted">(optional)</span>
            <input autoComplete="nickname" className={input} value={f.displayName} maxLength={40} onChange={(e) => setF({ ...f, displayName: e.target.value })} />
            {err("displayName")}
          </label>
        )}
        <label className="text-[13px] font-semibold">
          Password
          <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} className={input} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={mode === "signup" ? 10 : 1} />
          {mode === "signup" && <span className="mt-1 block text-[12px] text-muted">At least 10 characters.</span>}
          {err("password")}
        </label>
        {error && !error.field && <p role="alert" className="text-[14px] font-semibold text-citron">{error.msg}</p>}
        <button type="submit" disabled={busy} className="h-12 rounded-full bg-citron font-bold text-ink disabled:opacity-60">
          {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-[14px] text-muted">
        {mode === "login" ? "New here? " : "Already have an account? "}
        <Link href={`/${other}?next=${encodeURIComponent(next)}`} className="font-semibold text-citron">{mode === "login" ? "Create an account" : "Log in"}</Link>
      </p>
    </>
  );
}

export function LogOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/auth/logout", { method: "POST" });
        router.replace("/");
        router.refresh();
      }}
      className="h-11 rounded-full border border-ivory/25 px-5 text-[14px] font-semibold"
    >
      {busy ? "Logging out…" : "Log out"}
    </button>
  );
}
