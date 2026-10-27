/**
 * Title lab repository: title_labs (config, clusters, last simulation summary), title_variants,
 * and variant_events (one row per impression / click / booking). Counts are always aggregated from
 * variant_events with an explicit is_simulated filter, so simulated rows never reach real metrics.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Anchor, Counts } from "@/lib/titleLab";
import { db, newId, nowIso } from "./client";
import { eventQlooLinks, titleLabs, titleVariants, variantEvents } from "./schema";

export type VariantRecord = {
  id: string;
  title: string;
  hook: string;
  anchor: Anchor;
  status: "pending" | "approved" | "removed";
  origin: "llm" | "template" | "edited";
  priors: Record<string, number>;
  priorSource: "llm" | "heuristic";
  review: { reviewer: "rules" | "rules+llm"; notes: string[] };
};
export type LabHeader = { eventId: string; orgId: string; status: "running" | "paused"; createdAt: string; updatedAt: string; config: unknown; clusters: unknown; simulation?: unknown };
export type EventKind = "impression" | "click" | "booking";
export type Stats = Record<string, Record<string, Counts>>; // cluster → variant → counts

type VariantRow = typeof titleVariants.$inferSelect;
const toVariant = (v: VariantRow): VariantRecord => ({
  id: v.id,
  title: v.title,
  hook: v.hook,
  anchor: JSON.parse(v.anchorJson),
  status: v.status === "removed" ? "removed" : v.isApproved ? "approved" : "pending",
  origin: v.origin as VariantRecord["origin"],
  priors: JSON.parse(v.priorsJson),
  priorSource: v.priorSource as VariantRecord["priorSource"],
  review: JSON.parse(v.reviewJson),
});
const mean = (p: Record<string, number>) => {
  const xs = Object.values(p);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0.5;
};
const variantColumns = (v: VariantRecord) => ({
  title: v.title,
  hook: v.hook,
  anchorJson: JSON.stringify(v.anchor),
  llmPrior: mean(v.priors),
  priorsJson: JSON.stringify(v.priors),
  priorSource: v.priorSource,
  origin: v.origin,
  reviewJson: JSON.stringify(v.review),
  isApproved: v.status === "approved",
  status: v.status === "removed" ? ("removed" as const) : ("active" as const),
});

export async function getHeaders(eventIds: string[]): Promise<Map<string, LabHeader>> {
  if (!eventIds.length) return new Map();
  const rows = await db().select().from(titleLabs).where(inArray(titleLabs.eventId, eventIds));
  return new Map(
    rows.map((r) => [
      r.eventId,
      { eventId: r.eventId, orgId: r.organizerId, status: r.status, createdAt: r.createdAt, updatedAt: r.updatedAt, config: JSON.parse(r.configJson), clusters: JSON.parse(r.clustersJson), ...(r.simulationJson ? { simulation: JSON.parse(r.simulationJson) } : {}) },
    ]),
  );
}

export async function getVariants(eventIds: string[]): Promise<Map<string, VariantRecord[]>> {
  if (!eventIds.length) return new Map();
  const rows = await db().select().from(titleVariants).where(inArray(titleVariants.eventId, eventIds)).orderBy(asc(titleVariants.position));
  const out = new Map<string, VariantRecord[]>();
  for (const r of rows) out.set(r.eventId, [...(out.get(r.eventId) ?? []), toVariant(r)]);
  return out;
}

/** Creates or replaces a lab and its variants. Replacing deletes the old variants and, with them, their events. */
export async function replaceLab(h: LabHeader, variants: Omit<VariantRecord, "id">[]): Promise<VariantRecord[]> {
  const links = await db().select({ id: eventQlooLinks.id, qlooId: eventQlooLinks.qlooEntityId }).from(eventQlooLinks).where(eq(eventQlooLinks.eventId, h.eventId));
  const linkOf = new Map(links.map((l) => [l.qlooId, l.id]));
  const rows = variants.map((v, position) => ({ id: newId(), eventId: h.eventId, anchorLinkId: v.anchor.qlooId ? (linkOf.get(v.anchor.qlooId) ?? null) : null, position, ...variantColumns({ ...v, id: "" }) }));
  const header = { id: newId(), eventId: h.eventId, organizerId: h.orgId, status: h.status, configJson: JSON.stringify(h.config), clustersJson: JSON.stringify(h.clusters), simulationJson: null, updatedAt: nowIso() };
  const d = db();
  await d.batch([
    d.delete(titleVariants).where(eq(titleVariants.eventId, h.eventId)),
    d.insert(titleLabs).values(header).onConflictDoUpdate({ target: titleLabs.eventId, set: { status: header.status, configJson: header.configJson, clustersJson: header.clustersJson, simulationJson: null, updatedAt: header.updatedAt } }),
    ...(rows.length ? [d.insert(titleVariants).values(rows)] : []),
  ]);
  return (await getVariants([h.eventId])).get(h.eventId) ?? [];
}

export async function updateHeader(eventId: string, patch: { status?: "running" | "paused"; config?: unknown; simulation?: unknown }) {
  await db()
    .update(titleLabs)
    .set({
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.config !== undefined ? { configJson: JSON.stringify(patch.config) } : {}),
      ...(patch.simulation !== undefined ? { simulationJson: JSON.stringify(patch.simulation) } : {}),
      updatedAt: nowIso(),
    })
    .where(eq(titleLabs.eventId, eventId));
}

export async function updateVariant(v: VariantRecord) {
  await db().update(titleVariants).set({ ...variantColumns(v), updatedAt: nowIso() }).where(eq(titleVariants.id, v.id));
}

export async function setApproval(eventId: string, variantIds: string[] | "all-pending", approved: boolean) {
  const where = variantIds === "all-pending" ? and(eq(titleVariants.eventId, eventId), eq(titleVariants.status, "active")) : and(eq(titleVariants.eventId, eventId), inArray(titleVariants.id, variantIds));
  await db().update(titleVariants).set({ isApproved: approved, updatedAt: nowIso() }).where(where);
}

export async function setRemoved(eventId: string, variantId: string, removed: boolean) {
  await db().update(titleVariants).set({ status: removed ? "removed" : "active", ...(removed ? {} : { isApproved: false }), updatedAt: nowIso() }).where(and(eq(titleVariants.eventId, eventId), eq(titleVariants.id, variantId)));
}

/* ── Events (impressions, clicks, bookings) ── */

export type NewVariantEvent = { variantId: string; userId: string | null; clusterKey: string; kind: EventKind; isSimulated: boolean; createdAt?: string };

export async function insertEvents(rows: NewVariantEvent[]) {
  const d = db();
  const values = rows.map((r) => ({ id: newId(), variantId: r.variantId, userId: r.userId, clusterKey: r.clusterKey, kind: r.kind, isSimulated: r.isSimulated, ...(r.createdAt ? { createdAt: r.createdAt, updatedAt: r.createdAt } : {}) }));
  const chunks = [];
  for (let i = 0; i < values.length; i += 400) chunks.push(d.insert(variantEvents).values(values.slice(i, i + 400)));
  if (!chunks.length) return;
  await d.batch(chunks as [(typeof chunks)[number], ...(typeof chunks)[number][]]);
}

/** Removes the synthetic rows of an event's lab before a new simulation run. */
export async function deleteSimulated(eventId: string) {
  await db().delete(variantEvents).where(and(eq(variantEvents.isSimulated, true), inArray(variantEvents.variantId, db().select({ id: titleVariants.id }).from(titleVariants).where(eq(titleVariants.eventId, eventId)))));
}

/** cluster → variant → counts for these events, real or simulated only (never mixed). */
export async function stats(eventIds: string[], simulated: boolean): Promise<Map<string, Stats>> {
  if (!eventIds.length) return new Map();
  const rows = await db()
    .select({ eventId: titleVariants.eventId, variantId: variantEvents.variantId, cluster: variantEvents.clusterKey, kind: variantEvents.kind, n: sql<number>`count(*)` })
    .from(variantEvents)
    .innerJoin(titleVariants, eq(titleVariants.id, variantEvents.variantId))
    .where(and(inArray(titleVariants.eventId, eventIds), eq(variantEvents.isSimulated, simulated)))
    .groupBy(titleVariants.eventId, variantEvents.variantId, variantEvents.clusterKey, variantEvents.kind);
  const out = new Map<string, Stats>();
  const field = { impression: "impressions", click: "clicks", booking: "bookings" } as const;
  for (const r of rows) {
    const s = out.get(r.eventId) ?? {};
    const c = ((s[r.cluster] ??= {})[r.variantId] ??= { impressions: 0, clicks: 0, bookings: 0 });
    c[field[r.kind]] = r.n;
    out.set(r.eventId, s);
  }
  return out;
}

/** Most recent real events (newest first). */
export async function recentEvents(eventId: string, opts: { kind?: EventKind; limit: number }) {
  return db()
    .select({ variantId: variantEvents.variantId, clusterKey: variantEvents.clusterKey, kind: variantEvents.kind, userId: variantEvents.userId, at: variantEvents.createdAt })
    .from(variantEvents)
    .innerJoin(titleVariants, eq(titleVariants.id, variantEvents.variantId))
    .where(and(eq(titleVariants.eventId, eventId), eq(variantEvents.isSimulated, false), opts.kind ? eq(variantEvents.kind, opts.kind) : undefined))
    .orderBy(desc(variantEvents.createdAt))
    .limit(opts.limit);
}

export async function variantBelongs(eventId: string, variantId: string): Promise<boolean> {
  const [r] = await db().select({ id: titleVariants.id }).from(titleVariants).where(and(eq(titleVariants.id, variantId), eq(titleVariants.eventId, eventId)));
  return !!r;
}
