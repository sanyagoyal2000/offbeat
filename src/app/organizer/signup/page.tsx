import Link from "next/link";
import { redirect } from "next/navigation";
import { CITIES } from "@/lib/locations";
import { currentOrg } from "@/lib/server/organizer";
import { exploreLocation } from "@/lib/server/identity";
import { AuthForm } from "../login/AuthForm";

export default async function OrganizerSignup({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/organizer") && !sp.next.startsWith("//") ? sp.next : "/organizer";
  if (await currentOrg()) redirect(next);
  const loc = await exploreLocation();
  return (
    <main className="mx-auto max-w-md px-4 pt-8 sm:px-6">
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-citron">For organizers</p>
      <h1 className="font-display text-[24px]">Create an organizer account</h1>
      <p className="mt-1 text-[14px] text-ivory/75">Publish events, see demand from wishes and run promotion experiments.</p>
      <AuthForm mode="signup" next={next} cities={CITIES.map((c) => ({ id: c.id, name: `${c.name}, ${c.country}` }))} defaultCity={loc.id} />
      <p className="mt-4 text-[14px]">
        Already have an account? <Link href={`/organizer/login?next=${encodeURIComponent(next)}`} className="font-semibold text-citron">Sign in</Link>
      </p>
    </main>
  );
}
