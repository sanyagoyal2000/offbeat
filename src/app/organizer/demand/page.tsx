import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { CITIES, cityById } from "@/lib/locations";
import { formatMoney } from "@/lib/tz";
import { clusterWishes, type WishCluster } from "@/lib/wishes";
import { requireOrgPage } from "@/lib/server/organizer";
import { QlooUnavailable, insightsEntities } from "@/lib/server/qloo";
import { allWishes } from "@/lib/server/wishes";
import { CityFilter } from "./CityFilter";

async function alsoLoves(c: WishCluster): Promise<{ status: "ok" | "none" | "unavailable"; names: string[] }> {
  if (!c.tasteRefs.length) return { status: "none", names: [] };
  try {
    const { entities } = await insightsEntities({ "filter.type": "urn:entity:artist", "signal.interests.entities": c.tasteRefs.map((r) => r.id).join(","), take: 6 });
    const own = new Set(c.tasteRefs.map((r) => r.id));
    return { status: "ok", names: entities.filter((e) => !own.has(e.entity_id)).slice(0, 5).map((e) => e.name) };
  } catch (e) {
    if (e instanceof QlooUnavailable) return { status: "unavailable", names: [] };
    throw e;
  }
}

export default async function DemandPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const org = await requireOrgPage("/organizer/demand");
  const cityId = sp.city && cityById(sp.city) ? sp.city : org.cityId;
  const city = cityById(cityId)!;
  const clusters = clusterWishes(await allWishes(), { cityId, sinceDays: 30 });
  const loves = await Promise.all(clusters.map(alsoLoves));
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 pt-4 sm:px-6">
      <BackLink href="/organizer" label="Workspace" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px]">Demand from wishes</h1>
          <p className="text-[14px] text-ivory/75">Opted-in wishes from the last 30 days in {city.name}, grouped when every stated constraint overlaps. You see totals, never names.</p>
        </div>
        <CityFilter value={cityId} cities={CITIES.map((c) => ({ id: c.id, name: c.name }))} />
      </div>
      {clusters.length === 0 ? (
        <p className="rounded-[20px] border border-dashed border-ivory/20 p-5 text-[14px] text-muted">No opted-in wishes in {city.name} yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {clusters.map((c, i) => (
            <li key={c.key} className="rounded-[24px] border border-line bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-[17px]">{[c.category ?? "Any activity", c.keyword].filter(Boolean).join(" · ")}</h2>
                  <p className="text-[13px] text-muted">{c.areas.join(", ") || city.name} · within {c.radiusKm} km</p>
                </div>
                <p className="tnum rounded-[16px] bg-ink px-4 py-2 text-center">
                  <span className="block font-display text-[20px] text-citron">{c.realCount}</span>
                  <span className="text-[11px]">real wishes</span>
                  <span className="block text-[11px] text-muted">+ {c.seedCount} sample (demo data)</span>
                </p>
              </div>
              <dl className="tnum mt-3 grid gap-2 text-[13px] sm:grid-cols-3">
                <div><dt className="text-muted">Budget that fits everyone who gave one</dt><dd className="font-semibold">{c.budgetCeiling !== null ? `${formatMoney(c.budgetCeiling, c.currency)} (${c.budgetsGiven} gave a budget)` : "Not stated"}</dd></div>
                <div><dt className="text-muted">Dates everyone is free</dt><dd className="font-semibold">{c.dateWindow ? `${c.dateWindow.from} to ${c.dateWindow.to}` : "No shared window stated"}</dd></div>
                <div><dt className="text-muted">Taste references mentioned</dt><dd className="font-semibold">{c.tasteRefs.length ? c.tasteRefs.map((r) => `${r.name} (${r.count})`).join(", ") : "None"}</dd></div>
              </dl>
              <p className="mt-3 text-[13px] text-ivory/80">Why grouped: {c.explanation}.</p>
              <div className="mt-3 rounded-[16px] bg-raised p-3 text-[13px]">
                <p className="font-semibold text-citron">This crowd also loves (via Qloo)</p>
                <p className="mt-1">{loves[i].status === "ok" ? (loves[i].names.length ? loves[i].names.join(" · ") : "Qloo returned no related artists.") : loves[i].status === "none" ? "These wishes don't include taste references, so there's nothing to look up." : "Qloo is unavailable right now."}</p>
                <p className="mt-1 text-[11px] text-muted">Cultural associations from the wishers&apos; stated references. Use them for programming ideas, not as a guarantee of attendance.</p>
              </div>
              <p className="mt-3 text-[12px] text-muted">Interest isn&apos;t purchase intent: nobody has paid or committed.</p>
              <div className="mt-3">
                <Link href={`/organizer/events/new?cluster=${encodeURIComponent(c.key)}`} className="inline-flex h-11 items-center rounded-full bg-citron px-5 font-bold text-ink">Propose an event for this group</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
