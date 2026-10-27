import Link from "next/link";
import type { OfferEvent } from "@/lib/events";
import type { Anchor } from "@/lib/titleLab";
import { titleLabReport, type TitleLab } from "@/lib/server/titleLab";
import { TitleLabButton, VariantEditor } from "./TitleLabControls";

const pct = (x: number | null, digits = 1) => (x === null ? "–" : `${(x * 100).toFixed(digits)}%`);

function anchorLabel(a: Anchor) {
  switch (a.kind) {
    case "for-fans-of":
      return `For fans of ${a.name}`;
    case "performer":
      return `Performer: ${a.name}`;
    case "film":
      return `Film: ${a.name}`;
    case "tag":
      return `Vibe: ${a.name}`;
    default:
      return "Control (plain)";
  }
}

const STATUS_CHIP = { approved: "bg-citron text-ink", pending: "border border-ivory/25 text-ivory/80", removed: "bg-raised text-muted" } as const;

/** Simulation chart: share of traffic going to each cluster's best title, bandit vs equal split. */
function ConvergenceChart({ series, users }: { series: NonNullable<TitleLab["simulation"]>["series"]; users: number }) {
  const W = 320;
  const H = 130;
  const P = { l: 30, r: 8, t: 8, b: 22 };
  const x = (step: number) => P.l + ((W - P.l - P.r) * step) / users;
  const y = (v: number) => H - P.b - (H - P.t - P.b) * v;
  const line = (key: "banditBest" | "abBest") => series.map((p, i) => `${i ? "L" : "M"}${x(p.step).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[560px]" role="img" aria-label={`Share of recent simulated visitors shown a top title for their cluster. Bandit ends at ${pct(series.at(-1)?.banditBest ?? 0, 0)}; equal split ends at ${pct(series.at(-1)?.abBest ?? 0, 0)}.`}>
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-ivory/10" />
            <text x={P.l - 4} y={y(v) + 3} textAnchor="end" className="fill-[var(--color-muted)] text-[9px]">{v * 100}%</text>
          </g>
        ))}
        {[0, users / 2, users].map((s) => (
          <text key={s} x={x(s)} y={H - 6} textAnchor={s === 0 ? "start" : s === users ? "end" : "middle"} className="fill-[var(--color-muted)] text-[9px]">{s.toLocaleString()}</text>
        ))}
        <path d={line("abBest")} fill="none" stroke="var(--color-muted)" strokeWidth={1.5} strokeDasharray="4 3" />
        <path d={line("banditBest")} fill="none" stroke="var(--color-citron)" strokeWidth={2} />
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
        <span><span className="mr-1 inline-block h-0.5 w-4 bg-citron align-middle" />Bandit (UCB + priors, per cluster)</span>
        <span><span className="mr-1 inline-block w-4 border-t border-dashed border-muted align-middle" />Equal-split A/B test</span>
        <span>y: share of the last {Math.round(users / 10)} visitors shown a top title for their cluster (within 0.5 points of the best click rate) · x: visitors</span>
      </figcaption>
    </figure>
  );
}

function Simulation({ lab }: { lab: TitleLab }) {
  const sim = lab.simulation;
  const live = lab.variants.filter((v) => v.status !== "removed");
  return (
    <div className="mt-4 rounded-[18px] border border-dashed border-citron/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-citron">Simulated audience · synthetic visitors, not real data</p>
          <p className="mt-1 max-w-2xl text-[13px] text-ivory/80">
            2,000 synthetic visitors, each in one taste cluster. Each visitor&apos;s click chance for a title rises with Qloo&apos;s affinity between their cluster&apos;s reference and that title&apos;s anchor, plus random noise. The bandit and an equal split see the same visitors. These numbers are never added to the real metrics.
          </p>
        </div>
        <TitleLabButton eventId={lab.eventId} body={{ action: "simulate" }} label={sim ? "Run again" : "Run 2,000 simulated visitors"} tone="sim" busyLabel="Simulating…" />
      </div>
      {sim ? (
        <>
          <ConvergenceChart series={sim.series} users={sim.users} />
          <dl className="tnum mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Clicks · bandit", sim.bandit.clicks],
              ["Clicks · equal split", sim.equalSplit.clicks],
              ["Bookings · bandit", sim.bandit.bookings],
              ["Bookings · equal split", sim.equalSplit.bookings],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-[14px] bg-raised p-3">
                <dt className="text-[12px] text-muted">{k}</dt>
                <dd className="text-[18px] font-bold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[13px]">
            {sim.bandit.clicks >= sim.equalSplit.clicks
              ? `On these synthetic visitors the bandit got ${sim.bandit.clicks - sim.equalSplit.clicks} more clicks (${pct(sim.equalSplit.clicks ? sim.bandit.clicks / sim.equalSplit.clicks - 1 : 0, 0)}) and ${sim.bandit.bookings - sim.equalSplit.bookings} more bookings than an equal split.`
              : `On these synthetic visitors the equal split got ${sim.equalSplit.clicks - sim.bandit.clicks} more clicks than the bandit; noise can do this on small runs.`}
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-[12px]">
              <thead className="text-left text-muted">
                <tr><th className="py-1">Cluster (share of visitors)</th><th>Top title(s) by Qloo affinity</th><th>Affinity per title</th></tr>
              </thead>
              <tbody>
                {lab.clusters.map((c) => {
                  const top = (sim.topByCluster?.[c.id] ?? [sim.bestByCluster[c.id]]).map((id) => live.findIndex((v) => v.id === id)).filter((i) => i >= 0);
                  return (
                    <tr key={c.id} className="border-t border-line align-top">
                      <td className="py-1.5 pr-2">{c.label} <span className="tnum text-muted">({pct(sim.weights[c.id], 0)})</span></td>
                      <td className="pr-2">{top.length ? top.map((i) => `T${i + 1}`).join(", ") : "–"}</td>
                      <td className="tnum text-muted">{live.map((v, i) => `T${i + 1} ${(sim.affinity[c.id]?.[v.id] ?? 0).toFixed(2)}`).join(" · ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[12px] text-muted">
            Affinities: {sim.affinitySource === "qloo" ? "from Qloo Insights" : sim.affinitySource === "partial" ? "partly from Qloo (some calls failed; defaults used)" : "defaults (Qloo unavailable)"}. Ran {sim.ranAt.slice(0, 16).replace("T", " ")} UTC with prior weight {lab.config.priorWeight}, exploration {lab.config.exploration}.
          </p>
        </>
      ) : (
        <p className="mt-3 text-[13px] text-muted">No simulation run yet.</p>
      )}
    </div>
  );
}

export function TitleLabCard({ event: e, lab, simulated, toggleHref }: { event: OfferEvent; lab?: TitleLab; simulated: boolean; toggleHref: string }) {
  if (!lab)
    return (
      <article id={`tl-${e.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-line bg-card p-4">
        <div>
          <p className="font-semibold">{e.title}</p>
          <p className="text-[12px] text-muted">No title variants yet. They&apos;re drafted automatically when an event is published.</p>
        </div>
        <TitleLabButton eventId={e.id} body={{ action: "generate" }} label="Generate title variants" tone="primary" busyLabel="Drafting and checking…" note="Claude writes 5 variants, a second check reviews them, then Claude scores priors. Up to a minute." />
      </article>
    );
  const r = titleLabReport(lab);
  const approved = lab.variants.filter((v) => v.status === "approved").length;
  const pending = lab.variants.filter((v) => v.status === "pending").length;
  const serving = lab.status === "running" && approved >= 2;
  return (
    <article id={`tl-${e.id}`} className="scroll-mt-20 rounded-[20px] border border-line bg-card p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-citron">Title lab</p>
          <h3 className="font-display text-[18px] leading-snug">{e.title}</h3>
          <p className="text-[12px] text-muted">
            {serving ? "Live on Home cards" : lab.status === "paused" ? "Paused" : `Not live: approve at least 2 variants (${approved} approved)`} · {lab.clusters.length} taste clusters · prior weight {lab.config.priorWeight}, exploration {lab.config.exploration}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={toggleHref} scroll={false} role="switch" aria-checked={simulated} className={`flex h-10 items-center gap-2 rounded-full border px-3 text-[13px] font-bold ${simulated ? "border-citron bg-citron/15 text-citron" : "border-ivory/25"}`}>
            <span className={`relative h-5 w-9 rounded-full ${simulated ? "bg-citron" : "bg-raised"}`}><span className={`absolute top-0.5 size-4 rounded-full ${simulated ? "left-[18px] bg-ink" : "left-0.5 bg-ivory/70"}`} /></span>
            Simulated audience
          </Link>
          {pending > 0 && <TitleLabButton eventId={e.id} body={{ action: "approve-all" }} label={`Approve ${pending} pending`} tone="primary" />}
          <TitleLabButton eventId={e.id} body={{ action: lab.status === "running" ? "pause" : "resume" }} label={lab.status === "running" ? "Pause" : "Resume"} />
        </div>
      </header>

      {simulated ? (
        <Simulation lab={lab} />
      ) : (
        <>
          <p className="mt-3 rounded-[14px] bg-raised p-3 text-[14px]"><span className="font-semibold text-citron">Insight · </span>{r.insight}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead className="text-left text-[12px] text-muted">
                <tr><th className="py-1">Variant</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>Bookings</th><th>Traffic share</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {r.rows.map((row, i) => (
                  <tr key={row.variant.id} className="border-t border-line align-top">
                    <td className="max-w-[380px] py-2 pr-3">
                      <p className="font-semibold">T{i + 1}. {row.variant.title}</p>
                      <p className="text-ivory/75">{row.variant.hook}</p>
                      <p className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                        <span className={`rounded-full px-2 py-0.5 font-bold ${STATUS_CHIP[row.variant.status]}`}>{row.variant.status}</span>
                        <span className="rounded-full border border-ivory/15 px-2 py-0.5 text-ivory/80">{anchorLabel(row.variant.anchor)}</span>
                        <span className="text-muted">{row.variant.origin === "llm" ? "Claude draft" : row.variant.origin === "edited" ? "edited by you" : "template"} · checked by {row.variant.review.reviewer === "rules+llm" ? "rules + Claude review" : "rules"} · priors {row.variant.priorSource === "llm" ? "from Claude" : "heuristic"}</span>
                      </p>
                      {row.variant.review.notes.length > 0 && <p className="mt-1 text-[11px] text-muted">{row.variant.review.notes[0]}</p>}
                    </td>
                    <td className="tnum">{row.counts.impressions}</td>
                    <td className="tnum">{row.counts.clicks}</td>
                    <td className="tnum">{pct(row.ctr)}</td>
                    <td className="tnum">{row.counts.bookings}</td>
                    <td className="tnum">{pct(row.share, 0)}</td>
                    <td className="min-w-[150px]">
                      <div className="flex flex-wrap items-center">
                        {row.variant.status === "pending" && <TitleLabButton eventId={e.id} body={{ action: "approve", variantId: row.variant.id }} label="Approve" tone="quiet" />}
                        {row.variant.status !== "removed" ? <TitleLabButton eventId={e.id} body={{ action: "remove", variantId: row.variant.id }} label="Remove" tone="quiet" /> : <TitleLabButton eventId={e.id} body={{ action: "restore", variantId: row.variant.id }} label="Restore" tone="quiet" />}
                        <VariantEditor eventId={e.id} variantId={row.variant.id} title={row.variant.title} hook={row.variant.hook} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h4 className="mt-4 text-[12px] font-bold uppercase tracking-[0.08em] text-muted">Leader per taste cluster</h4>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {r.clusters.map((c) => (
              <li key={c.id} className="rounded-[14px] border border-line p-3 text-[13px]">
                <p className="font-semibold">{c.label}</p>
                <p className="tnum text-[12px] text-muted">{c.impressions} impressions · optimising {c.metric}</p>
                <p className="mt-1">{c.leader ? <>“{c.leader.title}” <span className="tnum text-muted">({pct(c.leader.rate)} vs {pct(c.leader.average)} avg)</span></> : <span className="text-muted">Too early to call</span>}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-muted">
            Real visitors only. Traffic share is over the last {lab.recent.length || 0} impressions. A leader is named only after every variant shown in that cluster has 30+ impressions. Holds count as bookings; the bandit optimises bookings once a cluster has {lab.config.minBookings}, clicks before that.
          </p>
          <div className="mt-2"><TitleLabButton eventId={e.id} body={{ action: "regenerate" }} label="Regenerate variants (resets counts)" tone="quiet" busyLabel="Drafting and checking…" /></div>
        </>
      )}
    </article>
  );
}
