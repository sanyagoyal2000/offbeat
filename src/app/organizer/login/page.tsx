import Link from "next/link";
import { redirect } from "next/navigation";
import { DEMO_PASSWORD, demoEmail, ensureDemoAccount } from "@/lib/server/auth";
import { sampleOrganizers } from "@/lib/server/catalog";
import { currentOrg } from "@/lib/server/organizer";
import { AuthForm } from "./AuthForm";

const safeNext = (n?: string) => (n && n.startsWith("/organizer") && !n.startsWith("//") ? n : "/organizer");

export default async function OrganizerLogin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await currentOrg()) redirect(next);
  const samples = await sampleOrganizers();
  const demos = samples.filter((o) => o.cityId === "bengaluru-in").slice(0, 3).concat(samples.filter((o) => o.cityId !== "bengaluru-in").slice(0, 2));
  await Promise.all(demos.map(ensureDemoAccount));
  return (
    <main className="mx-auto max-w-md px-4 pt-8 sm:px-6">
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-citron">For organizers</p>
      <h1 className="font-display text-[24px]">Sign in</h1>
      <p className="mt-1 text-[14px] text-ivory/75">Organizer accounts are separate from browsing. Attendees never need to sign in.</p>
      <AuthForm mode="login" next={next} />
      <p className="mt-4 text-[14px]">
        New organizer? <Link href={`/organizer/signup?next=${encodeURIComponent(next)}`} className="font-semibold text-citron">Create an account</Link>
      </p>
      <section className="mt-6 rounded-[20px] border border-dashed border-ivory/20 p-4 text-[13px]">
        <h2 className="font-semibold">Demo accounts (sample organizers)</h2>
        <p className="mt-1 text-muted">These run the fictional sample listings. Password for all: <code className="rounded bg-raised px-1.5 py-0.5 text-ivory">{DEMO_PASSWORD}</code></p>
        <ul className="mt-2 flex flex-col gap-1">
          {demos.map((o) => (
            <li key={o.id}><code className="text-ivory">{demoEmail(o.id)}</code> <span className="text-muted">· {o.name}</span></li>
          ))}
        </ul>
      </section>
    </main>
  );
}
