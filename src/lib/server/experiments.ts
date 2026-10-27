/**
 * Promotional experiments on in-app promo cards (LOLA-inspired; see src/lib/bandit.ts).
 * Responsibilities stay separate:
 *   - Qloo informs which audience is culturally relevant (src/lib/server/audience.ts).
 *   - An LLM (or deterministic templates) drafts a small, fixed set of factual variants.
 *   - The bandit allocates impressions and learns from observed clicks.
 * Real and simulated interactions are stored in separate counters and never mixed.
 */
import "server-only";
import { factLabels, cheapestTier, type OfferEvent } from "@/lib/events";
import { learningStatus, seededRng, selectionProbabilities, thompsonPick, type Arm } from "@/lib/bandit";
import { formatDayTime, nowIn } from "@/lib/tz";
import { track } from "./analytics";
import { connectedIds } from "./audience";
import { getEvent, publishedEvents, soldMaps } from "./catalog";
import { llmJson, llmProvider } from "./llm";
import * as repo from "./db/experiments";
import { newId } from "./db/client";
import type { Interest } from "./taste";

export const PRIOR_WEIGHT = 20; // pseudo-impressions the model prediction is worth
export const VARIANT_COUNT = 4;

export type Variant = { id: string; headline: string; body: string; predictedCtr: number; predictionSource: "llm" | "heuristic" };
export type Counts = repo.Counts;
export type Experiment = repo.ExperimentDoc;

const zero = (): Counts => ({ impressions: 0, clicks: 0, reservations: 0 });

/* ── Copy generation ─────────────────────────────────────────────── */

const BANNED = /\b(only \d+|\d+ left|selling fast|sell(?:s|ing)? out|last chance|limited|hurry|discount|% off|off\b.*%|deal|free gift|guaranteed|best in|#1|award)/i;

function eventFacts(e: OfferEvent) {
  return {
    title: e.title,
    category: e.category,
    summary: e.summary,
    whatYoullDo: e.whatYoullDo,
    audience: e.audience,
    venue: `${e.venue.name}, ${e.venue.area}`,
    performers: e.show?.performers ?? [],
    film: e.movie ? `${e.movie.language}, ${e.movie.runtimeMin} min` : undefined,
    level: e.class?.level,
    trek: e.trek ? `${e.trek.difficulty}${e.trek.distanceKm ? `, ${e.trek.distanceKm} km` : ""}` : undefined,
    facts: factLabels(e),
    inclusions: e.inclusions ?? [],
  };
}

/** Rejects copy that invents scarcity/discounts or mentions names not present in the facts. */
export function validCopy(v: { headline: string; body: string }, e: OfferEvent): boolean {
  if (!v.headline || !v.body || v.headline.length > 70 || v.body.length > 160) return false;
  if (BANNED.test(`${v.headline} ${v.body}`)) return false;
  const factText = JSON.stringify(eventFacts(e)).toLowerCase();
  // Capitalised multi-word names in the copy must appear in the facts (no invented performers).
  const names = [v.headline, v.body].flatMap((t) => t.match(/\b[A-Z][a-z]+(?: [A-Z][a-z]+)+\b/g) ?? []);
  return names.every((n) => factText.includes(n.toLowerCase()));
}

function templateVariants(e: OfferEvent): Omit<Variant, "id">[] {
  const f = factLabels(e);
  const doLine = e.whatYoullDo[0] ?? e.summary;
  const out = [
    { headline: e.summary.slice(0, 70), body: `${e.title} at ${e.venue.name}, ${e.venue.area}.` },
    { headline: doLine.slice(0, 70), body: e.audience ? e.audience.slice(0, 160) : `${e.category} at ${e.venue.name}.` },
    { headline: `${e.category} in ${e.venue.area}`, body: `${e.title}: ${e.summary}`.slice(0, 160) },
    { headline: f.length ? f.slice(0, 2).join(" · ") : `Plan your next ${e.category.toLowerCase()} outing`, body: `${e.title} at ${e.venue.name}. See dates and ticket types.`.slice(0, 160) },
  ];
  return out.map((v) => ({ ...v, predictedCtr: 0.04, predictionSource: "heuristic" as const }));
}

export async function draftVariants(e: OfferEvent): Promise<{ variants: Variant[]; source: "llm" | "template" }> {
  const prompt = `You write short in-app promotional cards for an event listing app.
Write exactly ${VARIANT_COUNT} different headline/body variants for the event below.
Rules:
- Use ONLY these facts. Do not invent performers, discounts, scarcity ("selling fast", "only X left"), awards, prices or inclusions.
- Do not change or repeat the official event name in the headline; it is shown separately.
- Headline at most 60 characters. Body at most 140 characters. Plain, specific, no hype, no emoji.
- Each variant should try a different angle (activity, who it's for, setting, practical details).
- For each, estimate "predicted_ctr": your best guess of click-through rate between 0.01 and 0.10.
Return JSON only: {"variants":[{"headline":"...","body":"...","predicted_ctr":0.04}]}
Facts: ${JSON.stringify(eventFacts(e))}`;
  const out = await llmJson<{ variants?: { headline: string; body: string; predicted_ctr?: number }[] }>(prompt);
  const good = (out?.variants ?? [])
    .map((v) => ({ headline: String(v.headline ?? "").trim(), body: String(v.body ?? "").trim(), predictedCtr: Math.min(0.1, Math.max(0.01, Number(v.predicted_ctr) || 0.04)), predictionSource: "llm" as const }))
    .filter((v) => validCopy(v, e));
  const base = good.length >= VARIANT_COUNT ? good.slice(0, VARIANT_COUNT) : [...good, ...templateVariants(e)].slice(0, VARIANT_COUNT);
  return { variants: base.map((v, i) => ({ ...v, id: `v${i + 1}` })), source: good.length ? "llm" : "template" };
}

export const copyProvider = () => llmProvider();

/* ── Experiments CRUD ────────────────────────────────────────────── */

export async function createExperiment(orgId: string, e: OfferEvent, audience: Experiment["audience"]): Promise<Experiment> {
  const { variants, source } = await draftVariants(e);
  const exp: Experiment = {
    id: newId(),
    eventId: e.id,
    orgId,
    audience,
    status: "draft",
    createdAt: new Date().toISOString(),
    copySource: source,
    variants,
    real: Object.fromEntries(variants.map((v) => [v.id, zero()])),
    simulated: Object.fromEntries(variants.map((v) => [v.id, zero()])),
  };
  await repo.putExperiment(exp);
  return exp;
}

export const getExperiment = (id: string) => repo.getExperiment(id);
export const experimentsForEvent = (eventId: string) => repo.listExperiments({ eventId });

export async function setStatus(id: string, orgId: string, status: "running" | "stopped") {
  const x = await getExperiment(id);
  if (!x || x.orgId !== orgId) return null;
  // Keep event and audience stable while comparing wording: only one running test per event.
  if (status === "running") for (const o of await experimentsForEvent(x.eventId)) if (o.id !== id && o.status === "running") await repo.putExperiment({ ...o, status: "stopped" });
  const next = { ...x, status, startedAt: status === "running" ? (x.startedAt ?? new Date().toISOString()) : x.startedAt };
  await repo.putExperiment(next);
  return next;
}

const bump = (id: string, variantId: string, kind: keyof Counts, source: "real" | "simulated", by = 1) => repo.bumpCounter(id, variantId, kind, source, by);

const arms = (x: Experiment, source: "real" | "simulated"): Arm[] =>
  x.variants.map((v) => ({ id: v.id, predictedCtr: v.predictedCtr, impressions: (source === "real" ? x.real : x.simulated)[v.id]?.impressions ?? 0, clicks: (source === "real" ? x.real : x.simulated)[v.id]?.clicks ?? 0 }));

/* ── Serving ─────────────────────────────────────────────────────── */

export type PromoPick = {
  experimentId: string;
  variantId: string;
  eventId: string;
  headline: string;
  body: string;
  audienceId: string;
  probability: number;
  event: { title: string; image: string; when: string; venue: string; sessionId: string };
};

export async function pickPromo(uid: string, cityId: string, interests: Interest[]): Promise<PromoPick | null> {
  const running = (await repo.listExperiments({ status: "running" })).filter((x) => x.audience.cityId === cityId);
  if (!running.length) return null;
  const events = new Map((await publishedEvents(cityId)).map((e) => [e.id, e]));
  const myIds = new Set(interests.map((i) => i.id));
  const eligible = [];
  for (const x of running) {
    const e = events.get(x.eventId);
    if (!e) continue;
    if (x.audience.kind === "connected") {
      const ids = await connectedIds(x.eventId);
      if (!ids || ![...myIds].some((i) => ids.has(i))) continue;
    }
    const sold = await soldMaps([e]);
    const now = nowIn(e.timezone);
    const session = e.sessions.find((s) => !s.cancelled && s.start > now && cheapestTier(s, sold[s.id] ?? {}));
    if (session) eligible.push({ x, e, session });
  }
  if (!eligible.length) return null;
  const rng = Math.random;
  const { x, e, session } = eligible[Math.floor(rng() * eligible.length)];
  const a = arms(x, "real");
  const idx = thompsonPick(a, PRIOR_WEIGHT, rng);
  const probability = selectionProbabilities(a, PRIOR_WEIGHT, rng, 400)[idx];
  const v = x.variants[idx];
  await bump(x.id, v.id, "impressions", "real");
  await track({ kind: "impression", eventId: e.id, uid, source: "real", experimentId: x.id, variantId: v.id, audienceId: x.audience.id, selectionProbability: probability });
  return {
    experimentId: x.id,
    variantId: v.id,
    eventId: e.id,
    headline: v.headline,
    body: v.body,
    audienceId: x.audience.id,
    probability,
    event: { title: e.title, image: e.image, when: formatDayTime(session.start), venue: `${e.venue.name}, ${e.venue.area}`, sessionId: session.id },
  };
}

export async function recordClick(uid: string, experimentId: string, variantId: string) {
  const x = await getExperiment(experimentId);
  if (!x || !x.variants.some((v) => v.id === variantId)) return null;
  await bump(x.id, variantId, "clicks", "real");
  await track({ kind: "click", eventId: x.eventId, uid, source: "real", experimentId: x.id, variantId, audienceId: x.audience.id });
  return x;
}

/** Called when a reservation carries a promo attribution (clicked a card for that event). */
export async function recordConversion(experimentId: string, variantId: string) {
  await bump(experimentId, variantId, "reservations", "real");
}

/* ── Simulation (synthetic, clearly separated) ───────────────────── */

export async function simulate(id: string, orgId: string, visitors = 1000) {
  {
    const x = await getExperiment(id);
    if (!x || x.orgId !== orgId) return null;
    const rng = seededRng(Date.now() % 2 ** 31);
    // Hidden "true" click rates for synthetic visitors: near the model prediction, with deliberate noise
    // so the prediction is sometimes wrong (that's what online learning has to correct).
    const trueCtr = Object.fromEntries(x.variants.map((v) => [v.id, Math.max(0.005, Math.min(0.2, v.predictedCtr * (0.5 + rng())))]));
    const sim = Object.fromEntries(x.variants.map((v) => [v.id, zero()]));
    const allocation: { step: number; shares: number[] }[] = [];
    for (let i = 1; i <= visitors; i++) {
      const a: Arm[] = x.variants.map((v) => ({ id: v.id, predictedCtr: v.predictedCtr, impressions: sim[v.id].impressions, clicks: sim[v.id].clicks }));
      const v = x.variants[thompsonPick(a, PRIOR_WEIGHT, rng)];
      sim[v.id].impressions++;
      if (rng() < trueCtr[v.id]) {
        sim[v.id].clicks++;
        if (rng() < 0.15) sim[v.id].reservations++;
      }
      if (i % Math.ceil(visitors / 10) === 0) allocation.push({ step: i, shares: x.variants.map((vv) => sim[vv.id].impressions / i) });
    }
    const next: Experiment = { ...x, simulated: sim, simulation: { runs: (x.simulation?.runs ?? 0) + 1, visitors, trueCtr, allocation } };
    await repo.putExperiment(next);
    return next;
  }
}

export function experimentReport(x: Experiment, source: "real" | "simulated") {
  const a = arms(x, source);
  const rng = seededRng(42);
  const probs = a.some((arm) => arm.impressions > 0) ? selectionProbabilities(a, PRIOR_WEIGHT, rng, 2000) : a.map(() => 1 / a.length);
  return {
    rows: x.variants.map((v, i) => {
      const c = (source === "real" ? x.real : x.simulated)[v.id] ?? zero();
      return { variant: v, counts: c, ctr: c.impressions ? c.clicks / c.impressions : null, allocation: probs[i] };
    }),
    status: learningStatus(a, seededRng(7)),
    totalImpressions: a.reduce((n, arm) => n + arm.impressions, 0),
  };
}

export async function eventForExperiment(x: Experiment) {
  return getEvent(x.eventId);
}
