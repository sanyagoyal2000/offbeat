import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { BackLink } from "@/components/BackLink";
import { ExperimentAction, NewExperiment } from "@/components/organizer/ExperimentControls";
import { PRIOR_WEIGHT_NOTE } from "@/lib/experimentCopy";
import { remaining } from "@/lib/events";
import { formatDayTime, formatMoney, nowIn } from "@/lib/tz";
import { metricsFor } from "@/lib/server/analytics";
import { audienceFor } from "@/lib/server/audience";
import { getEvent, soldMaps } from "@/lib/server/catalog";
import { copyProvider, experimentReport, experimentsForEvent, type Experiment } from "@/lib/server/experiments";
import { canEdit, requireOrgPage } from "@/lib/server/organizer";
import { reservationsForEvents } from "@/lib/server/reservations";
import { mappingsFor } from "@/lib/server/taste";

const Card = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="rounded-[24px] border border-line bg-card p-5">
    <h2 className="text-[16px] font-bold">{title}</h2>
    <div className="mt-2 text-[14px]">{children}</div>
  </section>
);

function ReportTable({ x, source }: { x: Experiment; source: "real" | "simulated" }) {
  const r = experimentReport(x, source);
  return (
    <div>
      <p className={`text-[13px] font-semibold ${r.status.state === "leader" ? "text-citron" : ""}`}>{r.status.message}</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead className="text-left text-muted">
            <tr><th className="py-1">Variant</th><th>Impressions</th><th>Clicks</th><th>Observed CTR</th><th>Reservations</th><th>Model prediction</th><th>Current allocation</th></tr>
          </thead>
          <tbody>
            {r.rows.map((row, i) => (
              <tr key={row.variant.id} className="border-t border-line align-top">
                <td className="py-2 pr-3"><span className="font-semibold">{i + 1}. {row.variant.headline}</span><span className="block text-muted">{row.variant.body}</span></td>
                <td className="tnum">{row.counts.impressions}</td>
                <td className="tnum">{row.counts.clicks}</td>
                <td className="tnum">{row.ctr === null ? "–" : `${(row.ctr * 100).toFixed(1)}%`}</td>
                <td className="tnum">{row.counts.reservations}</td>
                <td className="tnum text-muted">{(row.variant.predictedCtr * 100).toFixed(1)}% <span className="block text-[11px]">{row.variant.predictionSource === "llm" ? "LLM guess" : "flat default"}</span></td>
                <td className="tnum">{Math.round(row.allocation * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function ManageEvent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const org = await requireOrgPage(`/organizer/events/${id}`);
  const e = await getEvent(id);
  if (!e || e.organizerId !== org.id) notFound();
  const [m, sold, reservations, experiments] = await Promise.all([metricsFor(e.id), soldMaps([e]), reservationsForEvents(new Set([e.id])), experimentsForEvent(e.id)]);
  const audience = e.status === "published" ? await audienceFor(e) : null;
  const active = reservations.filter((r) => r.status === "reserved");
  const now = nowIn(e.timezone);
  const upcoming = e.sessions.filter((s) => s.start > now).slice(0, 8);
  const mappings = mappingsFor(e);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 pt-4 sm:px-6">
      <BackLink href="/organizer" label="Workspace" />
      {sp.saved && <p role="status" className="rounded-[16px] bg-citron p-3 text-[14px] font-semibold text-ink">Saved.</p>}
      {sp.proposed !== undefined && (
        <p role="status" className="rounded-[16px] bg-citron p-3 text-[14px] font-semibold text-ink">
          Published and proposed to {sp.proposed} real {sp.proposed === "1" ? "person" : "people"} whose wishes fit. They&apos;ll see it in the app (no external messages are sent). {sp.seed} sample wishes also fit (demo data, not notified).
        </p>
      )}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-citron">{e.category} · {e.status}{e.source === "sample" ? " · sample listing" : ""}</p>
          <h1 className="font-display text-[24px]">{e.title}</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/events/${e.id}`} className="flex h-11 items-center rounded-full border border-ivory/25 px-4 font-semibold">{e.status === "published" ? "View public page" : "Preview"}</Link>
          {canEdit(e, org.id) && <Link href={`/organizer/events/${e.id}/edit`} className="flex h-11 items-center rounded-full bg-citron px-4 font-bold text-ink">Edit</Link>}
        </div>
      </header>

      <Card title="Performance (real visitors only)">
        <dl className="tnum grid grid-cols-2 gap-3 sm:grid-cols-6">
          {[
            ["Detail views", m.view ?? 0],
            ["Promo impressions", m.impression ?? 0],
            ["Promo clicks", m.click ?? 0],
            ["Saves", m.save ?? 0],
            ["Demo reservations", `${active.length} (${active.reduce((n, r) => n + r.quantity, 0)} tickets)`],
            ["Paid bookings", "Unavailable"],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-[16px] bg-raised p-3">
              <dt className="text-[12px] text-muted">{k}</dt>
              <dd className="text-[18px] font-bold">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-[12px] text-muted">Paid bookings are unavailable because payments aren&apos;t connected; reservations here are demo holds. Simulated promo data is reported separately below and never included here.</p>
      </Card>

      <Card title="Upcoming dates">
        <ul className="flex flex-col gap-1">
          {upcoming.map((s) => {
            const cap = s.tiers.reduce((n, t) => n + t.capacity, 0);
            const left = s.tiers.reduce((n, t) => n + remaining(t, sold[s.id] ?? {}), 0);
            const res = active.filter((r) => r.sessionId === s.id);
            return (
              <li key={s.id} className="tnum flex flex-wrap justify-between gap-2 border-b border-line py-1.5">
                <span>{formatDayTime(s.start)}{s.cancelled ? " · cancelled" : ""}</span>
                <span className="text-muted">{cap - left}/{cap} sold · {res.reduce((n, r) => n + r.quantity, 0)} via demo reservations · from {formatMoney(Math.min(...s.tiers.map((t) => t.price)), e.currency)}</span>
              </li>
            );
          })}
          {upcoming.length === 0 && <li className="text-muted">No upcoming dates.</li>}
        </ul>
      </Card>

      <Card title="Audience suggestion">
        {e.status !== "published" ? (
          <p className="text-muted">Publish the event to estimate an audience.</p>
        ) : (
          <>
            <p>{audience!.explanation}</p>
            {audience!.connectedInterests.length > 0 && <p className="mt-2 text-[13px] text-ivory/80">Connected interests: {audience!.connectedInterests.join(", ")}</p>}
            <p className="mt-2 text-[12px] text-muted">
              Qloo references used: {mappings.length ? mappings.map((x) => `${x.qlooName} (${x.match})`).join(", ") : "none"}. Counts include only visitors who opted in under Profile → Notifications.
            </p>
          </>
        )}
      </Card>

      <Card title="Promotional experiments (LOLA-inspired)">
        <p className="text-[13px] text-ivory/80">
          Drafts four factual headline/body variants for Offbeat&apos;s in-app promo card (the official event name stays fixed), then allocates impressions adaptively: each variant starts from the model&apos;s predicted click rate as a weak prior, and real clicks take over as they arrive. {PRIOR_WEIGHT_NOTE}
        </p>
        <p className="mt-1 text-[12px] text-muted">Copy drafting: {copyProvider() === "none" ? "built-in templates (no LLM configured)" : copyProvider() === "claude-cli" ? "local Claude CLI (development only)" : "Anthropic API"}. Copy is checked against the event facts and rejected if it adds scarcity, discounts or names that aren&apos;t in the listing.</p>
        {e.status === "published" ? <div className="mt-3"><NewExperiment eventId={e.id} canConnected={audience?.status === "ok" && audience.connected > 0} /></div> : <p className="mt-2 text-muted">Publish the event first.</p>}
        <div className="mt-5 flex flex-col gap-5">
          {experiments.map((x) => (
            <article key={x.id} className="rounded-[20px] border border-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{x.audience.label}</p>
                  <p className="text-[12px] text-muted">Status: {x.status} · copy from {x.copySource === "llm" ? "LLM" : "templates"} · created {x.createdAt.slice(0, 10)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {x.status !== "running" ? <ExperimentAction id={x.id} action="start" label={x.status === "draft" ? "Start experiment" : "Resume"} primary /> : <ExperimentAction id={x.id} action="stop" label="Stop" />}
                  <ExperimentAction id={x.id} action="simulate" label="Demo: simulate 1,000 visitors" />
                </div>
              </div>
              <h3 className="mt-4 text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Preview</h3>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {x.variants.map((v, i) => (
                  <li key={v.id} className="rounded-[16px] border border-citron/25 bg-ink p-3">
                    <p className="text-[11px] text-muted">Variant {i + 1}</p>
                    <p className="font-display text-[14px]">{v.headline}</p>
                    <p className="text-[13px] text-ivory/80">{v.body}</p>
                    <p className="mt-1 text-[12px] font-semibold">{e.title}</p>
                  </li>
                ))}
              </ul>
              <h3 className="mt-4 text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Observed results (real visitors)</h3>
              <ReportTable x={x} source="real" />
              {x.simulation && (
                <div className="mt-4 rounded-[16px] border border-dashed border-citron/50 p-3">
                  <h3 className="text-[13px] font-bold uppercase tracking-[0.08em] text-citron">Simulation (synthetic visitors, not real data)</h3>
                  <p className="text-[12px] text-muted">
                    {x.simulation.visitors} synthetic visitors with hidden click rates ({x.variants.map((v, i) => `V${i + 1} ${(x.simulation!.trueCtr[v.id] * 100).toFixed(1)}%`).join(", ")}). Shows how allocation shifts as evidence accumulates.
                  </p>
                  <ReportTable x={x} source="simulated" />
                  <ol className="tnum mt-2 grid gap-1 text-[12px] text-muted sm:grid-cols-2">
                    {x.simulation.allocation.map((a) => <li key={a.step}>After {a.step}: {a.shares.map((s, i) => `V${i + 1} ${Math.round(s * 100)}%`).join(" · ")}</li>)}
                  </ol>
                </div>
              )}
            </article>
          ))}
        </div>
      </Card>
    </main>
  );
}
