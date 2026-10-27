/**
 * Title lab: per-event card titles chosen by a LOLA-style bandit (pure logic in src/lib/titleLab.ts).
 *   - Claude writes 5 title + hook variants, each anchored to one of the event's Qloo links.
 *   - Every variant must pass deterministic guardrails plus a second, Claude-run review before saving.
 *   - Claude scores each variant's click appeal per taste cluster; that's the bandit prior.
 *   - Taste cluster = the visitor's top-matching Qloo reference for the event (from rankByTaste).
 * Persistence: src/lib/server/db/titleLab.ts. Every impression/click/booking is a variant_events row;
 * simulated rows carry is_simulated = 1 and real metrics always filter them out.
 */
import "server-only";
import { factLabels, type OfferEvent } from "@/lib/events";
import {
  DEFAULT_UCB,
  HOOK_MAX,
  clusterLeader,
  insightLine,
  metricFor,
  TITLE_MAX,
  guardrailIssues,
  simulateTitleLab,
  ucbPick,
  zeroCounts,
  type Anchor,
  type ClusterReport,
  type Counts,
  type GuardContext,
  type SimResult,
  type UcbConfig,
} from "@/lib/titleLab";
import { getEvent } from "./catalog";
import { llmJson, llmProvider } from "./llm";
import { QlooUnavailable, insightsEntities, insightsTags } from "./qloo";
import * as repo from "./db/titleLab";
import { userIdFor } from "./db/users";
import { mappingsFor, rankByTaste, type EventMapping, type Interest } from "./taste";

export const VARIANTS_PER_EVENT = 5;
const RECENT = 200; // impressions kept for "current traffic share"
const LOG_MAX = 500;

export type Cluster = { id: string; label: string; qlooId?: string; qlooType?: string };
export type TitleVariant = {
  id: string;
  title: string;
  hook: string;
  anchor: Anchor;
  status: "pending" | "approved" | "removed";
  origin: "llm" | "template" | "edited";
  /** Predicted click appeal (0–1) per cluster id. */
  priors: Record<string, number>;
  priorSource: "llm" | "heuristic";
  review: { reviewer: "rules" | "rules+llm"; notes: string[] };
};
export type LabLogEntry = { at: string; kind: "impression" | "click" | "booking"; clusterId: string; variantId: string; uid?: string };
export type TitleLab = {
  id: string; // = eventId
  eventId: string;
  orgId: string;
  status: "running" | "paused";
  createdAt: string;
  updatedAt: string;
  config: UcbConfig;
  clusters: Cluster[];
  variants: TitleVariant[];
  /** Real visitors only (variant_events with is_simulated = 0): clusterId → variantId → counts. */
  stats: Record<string, Record<string, Counts>>;
  /** Synthetic audience only (is_simulated = 1). Shown only in the simulation view. */
  simStats: Record<string, Record<string, Counts>>;
  recent: string[];
  log: LabLogEntry[];
  /** Synthetic audience. Never read by serving or real metrics. */
  simulation?: Omit<SimResult, "banditByCluster"> & { ranAt: string; affinitySource: "qloo" | "partial" | "fallback"; affinity: Record<string, Record<string, number>>; weights: Record<string, number> };
};

const GENERAL: Cluster = { id: "general", label: "No matching interests" };

/* ── Anchors and clusters from the event's Qloo links ────────────── */

function anchorOf(m: EventMapping): Anchor {
  if (m.qlooType === "tag") return { kind: "tag", qlooId: m.qlooId, name: m.qlooName };
  if (m.relation === "performer") return { kind: "performer", qlooId: m.qlooId, name: m.qlooName };
  if (m.qlooType === "urn:entity:movie") return { kind: "film", qlooId: m.qlooId, name: m.qlooName };
  return { kind: "for-fans-of", qlooId: m.qlooId, name: m.qlooName };
}

/** One per "for fans of" entity, one vibe tag, then other links, filled to 4; plus a plain control. */
export function planAnchors(mappings: EventMapping[]): (Anchor & { angle: "primary" | "alternate" })[] {
  const all = mappings.map(anchorOf);
  const fans = all.filter((a) => a.kind === "for-fans-of");
  const tags = all.filter((a) => a.kind === "tag");
  const direct = all.filter((a) => a.kind === "performer" || a.kind === "film");
  const ordered = [...fans, ...tags.slice(0, 1), ...direct, ...tags.slice(1)];
  const picked: (Anchor & { angle: "primary" | "alternate" })[] = ordered.slice(0, VARIANTS_PER_EVENT - 1).map((a) => ({ ...a, angle: "primary" }));
  const pool = ordered.length ? ordered : [{ kind: "control" as const }];
  for (let i = 0; picked.length < VARIANTS_PER_EVENT - 1; i++) picked.push({ ...pool[i % pool.length], angle: "alternate" });
  return [...picked, { kind: "control", angle: "primary" }];
}

export function clustersFor(mappings: EventMapping[]): Cluster[] {
  const label = (m: EventMapping) => {
    if (m.qlooType === "tag") return `Into “${m.qlooName}”`;
    if (m.qlooType === "urn:entity:movie") return `Fans of ${m.qlooName} (film)`;
    return `Fans of ${m.qlooName}`;
  };
  return [...mappings.map((m) => ({ id: `ref:${m.qlooId}`, label: label(m), qlooId: m.qlooId, qlooType: m.qlooType })), GENERAL];
}

/* ── Facts, guardrails and the second check ──────────────────────── */

function facts(e: OfferEvent, mappings: EventMapping[]) {
  return {
    title: e.title,
    category: e.category,
    summary: e.summary,
    whatYoullDo: e.whatYoullDo,
    audience: e.audience,
    venue: `${e.venue.name}, ${e.venue.area}`,
    performers: e.show?.performers ?? [],
    film: mappings.filter((m) => m.qlooType === "urn:entity:movie").map((m) => m.qlooName),
    vibeTags: mappings.filter((m) => m.qlooType === "tag").map((m) => m.qlooName),
    facts: factLabels(e),
    inclusions: e.inclusions ?? [],
  };
}

function guardContext(e: OfferEvent, mappings: EventMapping[]): GuardContext {
  const f = facts(e, mappings);
  return { factText: [JSON.stringify(f), e.description].join(" ").toLowerCase(), referenceNames: mappings.filter((m) => anchorOf(m).kind === "for-fans-of").map((m) => m.qlooName) };
}

type Draft = { title: string; hook: string; anchor: Anchor };

/** Second check: Claude reviews every draft against the event data. Returns per-draft problems (empty = pass) or null when no LLM is available. */
async function llmReview(e: OfferEvent, mappings: EventMapping[], drafts: Draft[]): Promise<string[][] | null> {
  const refs = guardContext(e, mappings).referenceNames;
  const out = await llmJson<{ results?: { index: number; ok: boolean; problem?: string }[] }>(`You are reviewing event-card copy before it is shown to the public. Be strict.
Event data (the ONLY source of truth): ${JSON.stringify(facts(e, mappings))}
Audience references (these people are NOT performing and NOT involved in any way): ${JSON.stringify(refs)}
For each variant, fail it if ANY of these is true:
1. It states or implies that an audience reference is performing, appearing, involved, endorsing, or that their music/work will be played.
2. It makes a claim not supported by the event data (dates, numbers, prices, performers, inclusions, quality claims).
3. It uses false urgency or scarcity ("selling fast", "last chance", "limited", etc.).
Variants: ${JSON.stringify(drafts.map((d, index) => ({ index, title: d.title, hook: d.hook })))}
Return JSON only: {"results":[{"index":0,"ok":true,"problem":""}]}`);
  if (!out?.results) return null;
  return drafts.map((_, i) => {
    const r = out.results!.find((x) => x.index === i);
    return !r ? ["Reviewer returned no verdict."] : r.ok ? [] : [r.problem?.trim() || "Rejected by reviewer."];
  });
}

const fit = (s: string, max: number) => {
  const t = s.trim();
  if (t.length <= max) return t;
  const sentence = t.split(/(?<=[.!?])\s/)[0];
  if (sentence.length <= max) return sentence;
  return `${t.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
};

function templateDraft(e: OfferEvent, a: Anchor & { angle?: string }): Draft {
  const alt = a.angle === "alternate";
  const hook = fit(alt ? (e.whatYoullDo[0] ?? e.summary) : e.summary, HOOK_MAX);
  switch (a.kind) {
    case "for-fans-of":
      return { anchor: a, title: fit(alt ? `If you liked ${a.name}` : `For fans of ${a.name}`, TITLE_MAX), hook };
    case "performer":
      return { anchor: a, title: fit(`${a.name} at ${e.venue.name}`, TITLE_MAX), hook };
    case "film":
      return { anchor: a, title: fit(alt ? `${a.name} at ${e.venue.name}` : `${a.name} on the big screen`, TITLE_MAX), hook };
    case "tag":
      return { anchor: a, title: fit(`${a.name} ${alt ? "in" : "at"} ${alt ? e.venue.area : e.venue.name}`, TITLE_MAX), hook };
    default:
      return { anchor: a, title: fit(e.title, TITLE_MAX), hook: fit(`${e.category} at ${e.venue.name}, ${e.venue.area}`, HOOK_MAX) };
  }
}

function anchorBrief(a: Anchor & { angle?: string }) {
  const alt = a.angle === "alternate" ? " Use a different angle from the other variant on this anchor." : "";
  switch (a.kind) {
    case "for-fans-of":
      return `Appeal to fans of ${a.name}. You MUST use the phrasing "for fans of ${a.name}" or "if you liked ${a.name}". ${a.name} is NOT performing and NOT involved; never imply otherwise. In this variant's title AND hook, don't use any of these words: live, perform, play(s/ing), featuring, starring, presents, hosted, headline, guest, appear, sing(s/ing), tribute, cover(s), meet, with; and no possessive "${a.name}'s".${alt}`;
    case "performer":
      return `Lead with the performer ${a.name}, who is performing according to the listing.${alt}`;
    case "film":
      return `Lead with the film being screened, ${a.name}.${alt}`;
    case "tag":
      return `Lead with the vibe/genre "${a.name}".${alt}`;
    default:
      return "Plain descriptive control: say what the event is, with no references to artists, films or genres beyond the listing.";
  }
}

/** Claude drafts; each draft must pass the rules and the second check, otherwise its anchor's template is used. */
async function draftVariants(e: OfferEvent, mappings: EventMapping[]): Promise<{ drafts: (Draft & { origin: "llm" | "template"; notes: string[] })[]; reviewer: "rules" | "rules+llm" }> {
  const anchors = planAnchors(mappings);
  const ctx = guardContext(e, mappings);
  const out = await llmJson<{ variants?: { index: number; title: string; hook: string }[] }>(`You write the title and one-line hook shown on an event card in a discovery app.
Write exactly ${anchors.length} variants, one per anchor below, in the same order.
Rules:
- Title at most ${TITLE_MAX} characters. Hook at most ${HOOK_MAX} characters. No emoji.
- Make each title catchy: a playful turn of phrase, wordplay, a vivid image or a sharp contrast, the kind of line someone would repeat to a friend. Specific beats generic; avoid stock openers like "Join us", "Experience" or "An evening of".
- Catchy is not hype: no superlatives ("best", "ultimate", "unforgettable") and no claims the event data doesn't support.
- Write in sentence case. Don't capitalise made-up phrases as if they were names.
- Use ONLY the event data. Never invent performers, numbers, dates, prices, inclusions or quality claims.
- No urgency or scarcity ("selling fast", "last chance", "limited", "don't miss").
- Never imply that any referenced artist or creator is performing or involved unless they are listed as a performer.
Event data: ${JSON.stringify(facts(e, mappings))}
Anchors: ${JSON.stringify(anchors.map((a, index) => ({ index, brief: anchorBrief(a) })))}
Return JSON only: {"variants":[{"index":0,"title":"...","hook":"..."}]}`);

  const llmDrafts: (Draft | null)[] = anchors.map((a, i) => {
    const v = out?.variants?.find((x) => x.index === i);
    return v?.title && v?.hook ? { title: String(v.title).trim(), hook: String(v.hook).trim(), anchor: stripAngle(a) } : null;
  });
  const ruleIssues = llmDrafts.map((d) => (d ? guardrailIssues(d, ctx) : ["No draft."]));
  const candidates = llmDrafts.map((d, i) => (d && !ruleIssues[i].length ? d : null));
  const reviewed = candidates.some(Boolean) ? await llmReview(e, mappings, candidates.filter((d): d is Draft => !!d)) : null;
  let k = 0;
  const drafts = anchors.map((a, i) => {
    const d = candidates[i];
    const review = d ? (reviewed?.[k++] ?? []) : [];
    if (d && !review.length) return { ...d, origin: "llm" as const, notes: [] };
    const t = templateDraft(e, a);
    const why = !llmDrafts[i] ? "No LLM draft" : ruleIssues[i].length ? `LLM draft failed rules: ${ruleIssues[i][0]}` : `LLM draft failed review: ${review[0]}`;
    return { ...t, anchor: stripAngle(a), origin: "template" as const, notes: [`${why} Using a template.`, ...guardrailIssues(t, ctx)] };
  });
  return { drafts, reviewer: reviewed ? "rules+llm" : "rules" };
}

const stripAngle = (a: Anchor & { angle?: string }): Anchor => ({ kind: a.kind, qlooId: a.qlooId, name: a.name });

/* ── Priors ──────────────────────────────────────────────────────── */

export function heuristicAppeal(a: Anchor, c: Cluster): number {
  if (c.id === GENERAL.id) return a.kind === "control" ? 0.5 : 0.4;
  if (a.qlooId && a.qlooId === c.qlooId) return 0.75;
  return a.kind === "control" ? 0.45 : 0.35;
}

async function scorePriors(e: OfferEvent, variants: { id: string; title: string; hook: string; anchor: Anchor }[], clusters: Cluster[]): Promise<{ priors: Record<string, Record<string, number>>; source: "llm" | "heuristic" }> {
  const out = await llmJson<{ scores?: Record<string, Record<string, number>> }>(`Estimate how appealing each event-card variant is to visitors in each taste cluster, as the probability-like chance (0 to 1, relative) that such a visitor would click it.
Event: ${e.title} (${e.category}) at ${e.venue.name}, ${e.venue.area}.
Clusters (a visitor's interest that best matches this event): ${JSON.stringify(clusters.map((c) => ({ id: c.id, description: c.label })))}
Variants: ${JSON.stringify(variants.map((v) => ({ id: v.id, title: v.title, hook: v.hook })))}
Return JSON only, every variant × every cluster: {"scores":{"<variantId>":{"<clusterId>":0.5}}}`);
  const ok = (x: unknown) => typeof x === "number" && x >= 0 && x <= 1;
  const priors: Record<string, Record<string, number>> = {};
  let complete = !!out?.scores;
  for (const v of variants) {
    priors[v.id] = {};
    for (const c of clusters) {
      const s = out?.scores?.[v.id]?.[c.id];
      if (ok(s)) priors[v.id][c.id] = s as number;
      else {
        complete = false;
        priors[v.id][c.id] = heuristicAppeal(v.anchor, c);
      }
    }
  }
  return { priors, source: complete ? "llm" : "heuristic" };
}

/* ── CRUD ────────────────────────────────────────────────────────── */

async function assemble(eventIds: string[], opts: { withRecent: boolean }): Promise<Map<string, TitleLab>> {
  const [headers, variants, real, simulated] = await Promise.all([repo.getHeaders(eventIds), repo.getVariants(eventIds), repo.stats(eventIds, false), repo.stats(eventIds, true)]);
  const out = new Map<string, TitleLab>();
  for (const [eventId, h] of headers) {
    const recent = opts.withRecent ? await repo.recentEvents(eventId, { limit: LOG_MAX }) : [];
    out.set(eventId, {
      id: eventId,
      eventId,
      orgId: h.orgId,
      status: h.status,
      createdAt: h.createdAt,
      updatedAt: h.updatedAt,
      config: h.config as UcbConfig,
      clusters: h.clusters as Cluster[],
      variants: variants.get(eventId) ?? [],
      stats: real.get(eventId) ?? {},
      simStats: simulated.get(eventId) ?? {},
      recent: recent.filter((r) => r.kind === "impression").slice(0, RECENT).map((r) => r.variantId).reverse(),
      log: recent.map((r) => ({ at: r.at, kind: r.kind, clusterId: r.clusterKey, variantId: r.variantId, ...(r.userId ? { uid: r.userId } : {}) })).reverse(),
      ...(h.simulation ? { simulation: h.simulation as TitleLab["simulation"] } : {}),
    });
  }
  return out;
}

export const getTitleLab = async (eventId: string) => (await assemble([eventId], { withRecent: true })).get(eventId) ?? null;
export const titleLabsFor = (eventIds: string[]) => assemble(eventIds, { withRecent: true });
export const titleLabProvider = () => llmProvider();

/** Creates (or regenerates) the lab. Variants start "pending" until the organizer approves them. Regenerating resets counts. */
export async function createTitleLab(e: OfferEvent, orgId: string, opts: { force?: boolean } = {}): Promise<TitleLab> {
  const existing = await getTitleLab(e.id);
  if (existing && !opts.force) return existing;
  const mappings = mappingsFor(e);
  const clusters = clustersFor(mappings);
  const { drafts, reviewer } = await draftVariants(e, mappings);
  const keyed = drafts.map((d, i) => ({ ...d, id: `draft${i}` }));
  const { priors, source } = await scorePriors(e, keyed, clusters);
  const now = new Date().toISOString();
  await repo.replaceLab(
    { eventId: e.id, orgId, status: "running", createdAt: now, updatedAt: now, config: { ...DEFAULT_UCB }, clusters },
    keyed.map((d) => ({ title: d.title, hook: d.hook, anchor: d.anchor, status: "pending", origin: d.origin, priors: priors[d.id], priorSource: source, review: { reviewer, notes: d.notes } })),
  );
  return (await getTitleLab(e.id))!;
}

/** On publish, draft variants in the background (after the save response). Never fails the save. */
export async function generateOnPublish(e: OfferEvent, orgId: string) {
  if (e.status !== "published" || (await repo.getHeaders([e.id])).size) return;
  await createTitleLab(e, orgId).catch((err) => console.error("Title lab generation failed", err));
}

export class TitleLabError extends Error {}

type Change = { action: "approve" | "remove" | "restore" | "approve-all" | "pause" | "resume" } | { action: "edit"; variantId: string; title: string; hook: string } | { action: "config"; priorWeight: number; exploration: number };

/** Organizer edits. Edited copy must pass the same rules and second check before it's saved. */
export async function changeTitleLab(eventId: string, orgId: string, change: Change & { variantId?: string }): Promise<TitleLab> {
  const e = await getEvent(eventId);
  if (!e) throw new TitleLabError("Event not found.");
  const lab = await getTitleLab(eventId);
  if (!lab || lab.orgId !== orgId) throw new TitleLabError("Title lab not found.");
  const v = change.variantId ? lab.variants.find((x) => x.id === change.variantId) : undefined;
  if (change.variantId && !v) throw new TitleLabError("Variant not found.");
  switch (change.action) {
    case "approve":
      await repo.setApproval(eventId, [v!.id], true);
      break;
    case "remove":
      await repo.setRemoved(eventId, v!.id, true);
      break;
    case "restore":
      await repo.setRemoved(eventId, v!.id, false);
      break;
    case "approve-all":
      await repo.setApproval(eventId, "all-pending", true);
      break;
    case "pause":
    case "resume":
      await repo.updateHeader(eventId, { status: change.action === "pause" ? "paused" : "running" });
      break;
    case "config":
      await repo.updateHeader(eventId, { config: { ...lab.config, priorWeight: Math.max(0, Math.min(500, change.priorWeight)), exploration: Math.max(0, Math.min(5, change.exploration)) } });
      break;
    case "edit": {
      const mappings = mappingsFor(e);
      const draft = { title: change.title.trim(), hook: change.hook.trim(), anchor: v!.anchor };
      const issues = guardrailIssues(draft, guardContext(e, mappings));
      if (issues.length) throw new TitleLabError(issues.join(" "));
      const review = await llmReview(e, mappings, [draft]);
      if (review?.[0].length) throw new TitleLabError(`Second check: ${review[0][0]}`);
      const p = await scorePriors(e, [{ ...draft, id: v!.id }], lab.clusters);
      await repo.updateVariant({ ...v!, title: draft.title, hook: draft.hook, origin: "edited", status: "pending", review: { reviewer: review ? "rules+llm" : "rules", notes: [] }, priors: p.priors[v!.id], priorSource: p.source });
      break;
    }
  }
  return (await getTitleLab(eventId))!;
}

/* ── Serving and logging (real visitors) ─────────────────────────── */

export type CardTitle = { title: string; hook: string; href: string };

const serveable = (l: TitleLab) => l.status === "running" && l.variants.filter((v) => v.status === "approved").length >= 2;

/**
 * Called when Home renders cards: for each event with a running lab, find the visitor's cluster and
 * pick a variant by UCB within that cluster. Every pick is written as an impression row.
 */
export async function titleLabPicks(uid: string, interests: Interest[], events: OfferEvent[], cardHref: (e: OfferEvent) => string): Promise<Map<string, CardTitle>> {
  const picks = new Map<string, CardTitle>();
  const headers = await repo.getHeaders(events.map((e) => e.id));
  if (!headers.size) return picks;
  const labs = [...(await assemble([...headers.keys()], { withRecent: false })).values()].filter(serveable);
  if (!labs.length) return picks;
  const labEvents = events.filter((e) => labs.some((l) => l.eventId === e.id));
  const ranking = interests.length ? await rankByTaste(interests, labEvents).catch(() => null) : null;
  const userId = await userIdFor(uid);
  const rows: repo.NewVariantEvent[] = [];
  for (const lab of labs) {
    const e = labEvents.find((x) => x.id === lab.eventId)!;
    const ref = ranking?.reasons.get(e.id)?.refId;
    const clusterId = ref && lab.clusters.some((c) => c.id === `ref:${ref}`) ? `ref:${ref}` : GENERAL.id;
    const approved = lab.variants.filter((v) => v.status === "approved");
    const arms = approved.map((v) => ({ id: v.id, appeal: v.priors[clusterId] ?? 0.5, counts: lab.stats[clusterId]?.[v.id] ?? zeroCounts() }));
    const v = approved[ucbPick(arms, lab.config)];
    rows.push({ variantId: v.id, userId, clusterKey: clusterId, kind: "impression", isSimulated: false });
    const q = new URLSearchParams({ e: e.id, v: v.id, c: clusterId, to: cardHref(e) });
    picks.set(e.id, { title: v.title, hook: v.hook, href: `/api/title-lab/click?${q}` });
  }
  await repo.insertEvents(rows);
  return picks;
}

export async function recordTitleLab(kind: "click" | "booking", eventId: string, variantId: string, clusterId: string, uid?: string): Promise<boolean> {
  const [headers, belongs] = await Promise.all([repo.getHeaders([eventId]), repo.variantBelongs(eventId, variantId)]);
  const clusters = (headers.get(eventId)?.clusters ?? []) as Cluster[];
  if (!belongs || !clusters.some((c) => c.id === clusterId)) return false;
  await repo.insertEvents([{ variantId, userId: uid ? await userIdFor(uid) : null, clusterKey: clusterId, kind, isSimulated: false }]);
  return true;
}

/* ── Simulation (synthetic audience) ─────────────────────────────── */

/**
 * Affinity of each cluster's reference to each variant's anchor, from Qloo Insights with the cluster's
 * reference as the signal and the anchors as `filter.results`. Same reference = 1; control = 0.35;
 * "no matching interests" = 0.4 for anchored titles and 0.5 for the control. Anchors Qloo doesn't
 * return get 0.2. Raw affinities from different queries are used directly here (a simplification
 * that's acceptable for a synthetic audience, not for ranking).
 */
async function qlooAffinity(lab: TitleLab): Promise<{ affinity: Record<string, Record<string, number>>; source: "qloo" | "partial" | "fallback" }> {
  const affinity: Record<string, Record<string, number>> = {};
  let calls = 0;
  let failures = 0;
  const variants = lab.variants.filter((v) => v.status !== "removed");
  for (const c of lab.clusters) {
    affinity[c.id] = {};
    if (!c.qlooId) {
      for (const v of variants) affinity[c.id][v.id] = v.anchor.kind === "control" ? 0.5 : 0.4;
      continue;
    }
    const signal = c.qlooType === "tag" ? { "signal.interests.tags": c.qlooId } : { "signal.interests.entities": c.qlooId };
    const found = new Map<string, number>();
    const anchors = [...new Map(variants.filter((v) => v.anchor.qlooId && v.anchor.qlooId !== c.qlooId).map((v) => [v.anchor.qlooId!, v.anchor])).values()];
    const tagIds = anchors.filter((a) => a.kind === "tag").map((a) => a.qlooId!);
    const byType = new Map<string, string[]>();
    for (const a of anchors.filter((x) => x.kind !== "tag")) {
      const type = a.kind === "film" ? "urn:entity:movie" : "urn:entity:artist";
      byType.set(type, [...(byType.get(type) ?? []), a.qlooId!]);
    }
    try {
      if (tagIds.length) {
        calls++;
        for (const t of await insightsTags({ ...signal, "filter.results.tags": tagIds.join(","), take: tagIds.length })) {
          if (typeof t.query?.affinity === "number") found.set(t.tag_id ?? t.id ?? "", t.query.affinity);
        }
      }
      for (const [type, ids] of byType) {
        calls++;
        const { entities } = await insightsEntities({ "filter.type": type, ...signal, "filter.results.entities": ids.join(","), take: ids.length });
        for (const ent of entities) if (typeof ent.query?.affinity === "number") found.set(ent.entity_id, ent.query.affinity);
      }
    } catch (err) {
      if (!(err instanceof QlooUnavailable)) throw err;
      failures++;
    }
    for (const v of variants) {
      affinity[c.id][v.id] = v.anchor.kind === "control" ? 0.35 : v.anchor.qlooId === c.qlooId ? 1 : (found.get(v.anchor.qlooId ?? "") ?? 0.2);
    }
  }
  return { affinity, source: calls === 0 ? "qloo" : failures === 0 ? "qloo" : failures >= calls ? "fallback" : "partial" };
}

/**
 * Runs the synthetic audience. Its rows go to variant_events with is_simulated = 1 (replacing the
 * previous run's); the chart series and equal-split comparison are stored on the lab header.
 */
export async function runSimulation(eventId: string, orgId: string, users = 2000): Promise<TitleLab> {
  const lab = await getTitleLab(eventId);
  if (!lab || lab.orgId !== orgId) throw new TitleLabError("Title lab not found.");
  const { affinity, source } = await qlooAffinity(lab);
  const referenced = lab.clusters.filter((c) => c.qlooId);
  // 40% of synthetic visitors have no matching interests; the rest split evenly across references.
  const weights = Object.fromEntries(lab.clusters.map((c) => [c.id, c.qlooId ? 0.6 / Math.max(1, referenced.length) : referenced.length ? 0.4 : 1]));
  const variants = lab.variants.filter((v) => v.status !== "removed");
  const result = simulateTitleLab({
    variants: variants.map((v) => ({ id: v.id, priors: v.priors })),
    clusters: lab.clusters.map((c) => ({ id: c.id, weight: weights[c.id] })),
    affinity,
    users,
    seed: Date.now() % 2 ** 31,
    cfg: lab.config,
  });
  const { banditByCluster, ...summary } = result;
  const at = Date.now();
  const rows: repo.NewVariantEvent[] = [];
  for (const [clusterKey, byVariant] of Object.entries(banditByCluster))
    for (const [variantId, c] of Object.entries(byVariant))
      for (const [kind, n] of [["impression", c.impressions], ["click", c.clicks], ["booking", c.bookings]] as const)
        for (let i = 0; i < n; i++) rows.push({ variantId, userId: null, clusterKey, kind, isSimulated: true, createdAt: new Date(at + rows.length).toISOString() });
  await repo.deleteSimulated(eventId);
  await repo.insertEvents(rows);
  await repo.updateHeader(eventId, { simulation: { ...summary, ranAt: new Date(at).toISOString(), affinitySource: source, affinity, weights } });
  return (await getTitleLab(eventId))!;
}

/* ── Organizer report (real visitors only) ───────────────────────── */

export type VariantRow = { variant: TitleVariant; counts: Counts; ctr: number | null; share: number | null };
export type TitleLabReport = { rows: VariantRow[]; clusters: (ClusterReport & { id: string })[]; totalImpressions: number; insight: string };

export function titleLabReport(lab: TitleLab): TitleLabReport {
  const live = lab.variants.filter((v) => v.status !== "removed");
  const rows = live.map((v) => {
    const counts = lab.clusters.reduce((n, c) => {
      const x = lab.stats[c.id]?.[v.id] ?? zeroCounts();
      return { impressions: n.impressions + x.impressions, clicks: n.clicks + x.clicks, bookings: n.bookings + x.bookings };
    }, zeroCounts());
    const share = lab.recent.length ? lab.recent.filter((id) => id === v.id).length / lab.recent.length : null;
    return { variant: v, counts, ctr: counts.impressions ? counts.clicks / counts.impressions : null, share };
  });
  const clusters = lab.clusters.map((c) => {
    const cRows = live.map((v) => ({ title: v.title, counts: lab.stats[c.id]?.[v.id] ?? zeroCounts() }));
    const metric = metricFor(cRows.map((r) => r.counts), lab.config);
    return { id: c.id, label: c.label, metric, impressions: cRows.reduce((n, r) => n + r.counts.impressions, 0), leader: clusterLeader(cRows, metric) };
  });
  const totalImpressions = rows.reduce((n, r) => n + r.counts.impressions, 0);
  return { rows, clusters, totalImpressions, insight: insightLine(totalImpressions, clusters) };
}
