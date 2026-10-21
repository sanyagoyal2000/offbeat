import Link from "next/link";
import { UsersIcon } from "@/components/icons";
import { centroid } from "@/lib/geo";
import { todayIn } from "@/lib/tz";
import { publishedEvents } from "@/lib/server/catalog";
import { exploreLocation } from "@/lib/server/identity";
import { PlanAssistant } from "./PlanAssistant";

export default async function PlanPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const loc = await exploreLocation();
  const events = await publishedEvents(loc.id);
  const areas = [...new Set(events.map((e) => e.venue.area))].sort().map((name) => ({ name, ...centroid(events.filter((e) => e.venue.area === name).map((e) => e.venue))! }));
  return (
    <main className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
      <h1 className="font-display text-[24px]">Plan an outing</h1>
      <p className="mt-1 max-w-2xl text-[14px] text-ivory/75">
        Tell the assistant what has to be true, and it returns up to three options that meet every requirement in {loc.name}. It never loosens a requirement on its own.
      </p>
      <Link href="/friends" className="mt-4 flex items-center gap-3 rounded-[20px] border border-citron/30 bg-citron/5 p-4">
        <UsersIcon size={24} className="flex-none text-citron" />
        <span><span className="block text-[14px] font-bold">Deciding with friends?</span><span className="block text-[13px] text-muted">Make a shared shortlist, invite friends and vote. →</span></span>
      </Link>
      <PlanAssistant
        city={{ id: loc.id, name: loc.name, currency: events[0]?.currency ?? loc.currency }}
        today={todayIn(loc.timezone)}
        areas={areas}
        hasInventory={events.length > 0}
        prefill={{ from: sp.from, to: sp.to }}
      />
    </main>
  );
}
