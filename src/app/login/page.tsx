import Link from "next/link";
import { redirect } from "next/navigation";
import { UserAuthForm } from "@/components/account/UserAuthForm";
import { safeNext } from "@/lib/safeNext";
import { currentUser } from "@/lib/server/identity";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const next = safeNext((await searchParams).next);
  if ((await currentUser()).account) redirect(next);
  return (
    <main className="mx-auto max-w-md px-4 pt-8 sm:px-6">
      <h1 className="font-display text-[24px] leading-tight">Log in to Offbeat</h1>
      <p className="mt-1 text-[14px] text-ivory/75">
        Group plans need an account so everyone on a board is a real person. Browsing and booking work without one.
      </p>
      {/^\/(friends|boards\/|events\/[^?]+\?plan=1)/.test(next) && (
        <p role="status" className="mt-4 rounded-[14px] border border-citron/40 bg-citron/5 p-3 text-[14px]">{"Log in to plan with friends. You'll go straight back afterwards."}</p>
      )}
      <UserAuthForm mode="login" next={next} />
      <p className="mt-6 text-[12px] text-muted">Organizing events? <Link href="/organizer/login" className="underline underline-offset-2">Organizer sign-in</Link> is separate.</p>
    </main>
  );
}
