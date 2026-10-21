import { BackLink } from "@/components/BackLink";
import { EventEditor } from "@/components/organizer/EventEditor";
import { CITIES } from "@/lib/locations";
import type { Category } from "@/lib/categories";
import { clusterWishes } from "@/lib/wishes";
import { emptyInput } from "@/lib/server/eventForm";
import { requireOrgPage } from "@/lib/server/organizer";
import { allWishes } from "@/lib/server/wishes";

export default async function NewEventPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const org = await requireOrgPage("/organizer/events/new");
  const cluster = sp.cluster ? clusterWishes(await allWishes()).find((c) => c.key === sp.cluster) : undefined;
  const cityId = cluster?.cityId ?? org.cityId;
  const preset = cluster
    ? {
        category: (cluster.category ?? "Music") as Category,
        title: "",
        summary: cluster.keyword ? `A ${cluster.keyword} ${cluster.category?.toLowerCase() ?? "event"}` : "",
        venue: { name: "", area: cluster.areas[0] ?? "", lat: cluster.center.lat, lng: cluster.center.lng },
        proposedForCluster: cluster.key,
        sessions: [{ date: cluster.dateWindow?.from ?? new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10), time: "19:00", tiers: [{ name: "General", price: cluster.budgetCeiling ? Math.floor(cluster.budgetCeiling * 0.9) : 999, capacity: 40 }] }],
      }
    : undefined;
  return (
    <main className="mx-auto max-w-4xl px-4 pt-4 sm:px-6">
      <BackLink href="/organizer" label="Workspace" />
      <h1 className="font-display text-[24px]">Create an event</h1>
      {(
        <>
          {cluster && (
            <p className="mt-2 rounded-[16px] border border-citron/40 p-3 text-[13px]">
              Proposing for a demand cluster: {cluster.explanation}. When you publish, the {cluster.realCount} real {cluster.realCount === 1 ? "person" : "people"} whose wishes fit will see your proposal in the app. The ticket price is pre-set just under the lowest stated budget; change anything.
            </p>
          )}
          <div className="mt-4">
            <EventEditor initial={emptyInput(cityId, preset)} cities={CITIES.map((c) => ({ id: c.id, name: c.name, currency: c.currency, lat: c.lat, lng: c.lng }))} reservedBySession={{}} />
          </div>
        </>
      )}
    </main>
  );
}
