/** Promo-card experiments. Real and simulated counters are separate JSON columns and are never merged. */
import { desc, eq, sql } from "drizzle-orm";
import { db, nowIso } from "./client";
import { promoExperiments } from "./schema";

export type Counts = { impressions: number; clicks: number; reservations: number };
export type ExperimentDoc = {
  id: string;
  eventId: string;
  orgId: string;
  audience: { id: string; kind: "city" | "connected"; label: string; cityId: string };
  status: "draft" | "running" | "stopped";
  createdAt: string;
  startedAt?: string;
  copySource: "llm" | "template";
  variants: { id: string; headline: string; body: string; predictedCtr: number; predictionSource: "llm" | "heuristic" }[];
  real: Record<string, Counts>;
  simulated: Record<string, Counts>;
  simulation?: { runs: number; visitors: number; trueCtr: Record<string, number>; allocation: { step: number; shares: number[] }[] };
};

type Row = typeof promoExperiments.$inferSelect;
const toDoc = (r: Row): ExperimentDoc => ({
  id: r.id,
  eventId: r.eventId,
  orgId: r.organizerId,
  audience: JSON.parse(r.audienceJson),
  status: r.status,
  createdAt: r.createdAt,
  ...(r.startedAt ? { startedAt: r.startedAt } : {}),
  copySource: r.copySource as ExperimentDoc["copySource"],
  variants: JSON.parse(r.variantsJson),
  real: JSON.parse(r.realCountsJson),
  simulated: JSON.parse(r.simCountsJson),
  ...(r.simulationJson ? { simulation: JSON.parse(r.simulationJson) } : {}),
});

export async function putExperiment(x: ExperimentDoc) {
  const row = {
    id: x.id,
    eventId: x.eventId,
    organizerId: x.orgId,
    audienceJson: JSON.stringify(x.audience),
    status: x.status,
    startedAt: x.startedAt ?? null,
    copySource: x.copySource,
    variantsJson: JSON.stringify(x.variants),
    realCountsJson: JSON.stringify(x.real),
    simCountsJson: JSON.stringify(x.simulated),
    simulationJson: x.simulation ? JSON.stringify(x.simulation) : null,
    createdAt: x.createdAt,
    updatedAt: nowIso(),
  };
  await db().insert(promoExperiments).values(row).onConflictDoUpdate({ target: promoExperiments.id, set: { ...row, id: undefined, createdAt: undefined } });
}

export async function getExperiment(id: string) {
  const [r] = await db().select().from(promoExperiments).where(eq(promoExperiments.id, id));
  return r ? toDoc(r) : null;
}

export async function listExperiments(where: { eventId?: string; status?: ExperimentDoc["status"] } = {}) {
  const rows = await db()
    .select()
    .from(promoExperiments)
    .where(where.eventId ? eq(promoExperiments.eventId, where.eventId) : where.status ? eq(promoExperiments.status, where.status) : undefined)
    .orderBy(desc(promoExperiments.createdAt));
  return rows.map(toDoc);
}

/** Atomic counter increment inside the JSON column (no read-modify-write race). */
export async function bumpCounter(id: string, variantId: string, kind: keyof Counts, source: "real" | "simulated", by = 1) {
  if (!/^[\w-]+$/.test(variantId)) throw new Error("Invalid variant id");
  const col = source === "real" ? promoExperiments.realCountsJson : promoExperiments.simCountsJson;
  const path = `$.${variantId}.${kind}`;
  const set = sql`json_set(${col}, ${path}, coalesce(json_extract(${col}, ${path}), 0) + ${by})`;
  await db()
    .update(promoExperiments)
    .set(source === "real" ? { realCountsJson: set, updatedAt: nowIso() } : { simCountsJson: set, updatedAt: nowIso() })
    .where(eq(promoExperiments.id, id));
}
