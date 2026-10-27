import Link from "next/link";
import { redirect } from "next/navigation";
import { UserAuthForm } from "@/components/account/UserAuthForm";
import { safeNext } from "@/lib/safeNext";
import { currentUser } from "@/lib/server/identity";

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const next = safeNext((await searchParams).next);
  if ((await currentUser()).account) redirect(next);
  return (
    <main className="mx-auto max-w-md px-4 pt-8 sm:px-6">
      <h1 className="font-display text-[24px] leading-tight">Create your account</h1>
      <p className="mt-1 text-[14px] text-ivory/75">
        Your interests, saved events, tickets and wishes from this browser come with you. Browsing and booking still work without an account.
      </p>
      {/^\/(friends|boards\/|events\/[^?]+\?plan=1)/.test(next) && (
        <p role="status" className="mt-4 rounded-[14px] border border-citron/40 bg-citron/5 p-3 text-[14px]">{"Create an account to plan with friends. You'll go straight back afterwards."}</p>
      )}
      <UserAuthForm mode="signup" next={next} />
      <p className="mt-6 text-[12px] text-muted">Organizing events? <Link href="/organizer/login" className="underline underline-offset-2">Organizer sign-in</Link> is separate.</p>
    </main>
  );
}
