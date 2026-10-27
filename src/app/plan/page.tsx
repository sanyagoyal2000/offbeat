import Link from "next/link";
import { UsersIcon } from "@/components/icons";
import { centroid } from "@/lib/geo";
import { todayIn } from "@/lib/tz";
import { publishedEvents } from "@/lib/server/catalog";
import { currentUid, exploreLocation } from "@/lib/server/identity";
import { myPlans } from "@/lib/server/plans";
import { PlanAssistant } from "./PlanAssistant";
import { PlanWorkspace } from "./PlanControls";
import { SavedForLater } from "./SavedForLater";
import { YourPlans } from "./YourPlans";

export default async function PlanPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [loc, uid] = await Promise.all([exploreLocation(), currentUid()]);
  const [events, plans] = await Promise.all([publishedEvents(loc.id), myPlans(uid)]);
  const areas = [...new Set(events.map((e) => e.venue.area))].sort().map((name) => ({ name, ...centroid(events.filter((e) => e.venue.area === name).map((e) => e.venue))! }));
  // Open the planner straight away when there's nothing saved yet, or when arriving to (re)plan.
  const startOpen = plans.length === 0 || !!(sp.replan || sp.from || sp.to);
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pt-6 sm:px-6">
      <header>
        <h1 className="font-display text-[24px]">Plan an outing</h1>
        <p className="mt-1 max-w-2xl text-[14px] text-ivory/75">
          Tell the assistant what has to be true, and it returns up to three options that meet every requirement in {loc.name}. It never loosens a requirement on its own. Save the ones you like to come back to them.
        </p>
      </header>

      {plans.length > 0 && <YourPlans plans={plans} />}

      <PlanWorkspace startOpen={startOpen}>
        <PlanAssistant
          city={{ id: loc.id, name: loc.name, currency: events[0]?.currency ?? loc.currency }}
          today={todayIn(loc.timezone)}
          areas={areas}
          hasInventory={events.length > 0}
          prefill={{ from: sp.from, to: sp.to }}
          replanSession={sp.replan}
          savedSessionIds={plans.map((p) => p.sessionId)}
        />
      </PlanWorkspace>

      <Link href="/friends" className="flex items-center gap-3 rounded-[20px] border border-citron/30 bg-citron/5 p-4">
        <UsersIcon size={24} className="flex-none text-citron" />
        <span><span className="block text-[14px] font-bold">Deciding with friends?</span><span className="block text-[13px] text-muted">Make a shared group plan, invite friends and vote. →</span></span>
      </Link>

      <SavedForLater uid={uid} />
    </main>
  );
}
