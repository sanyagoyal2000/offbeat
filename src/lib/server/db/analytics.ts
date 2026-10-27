/** Interaction log (views, saves, reservations, promo impressions/clicks). Real metrics always filter is_simulated = 0. */
import { and, asc, eq, sql } from "drizzle-orm";
import { db, newId } from "./client";
import { interactions } from "./schema";

export type MetricKind = "view" | "impression" | "click" | "save" | "reservation";
export type Source = "real" | "simulated";
export type InteractionEvent = {
  at: string;
  kind: MetricKind;
  eventId: string;
  uid: string;
  source: Source;
  experimentId?: string;
  variantId?: string;
  audienceId?: string;
  selectionProbability?: number;
  reservationId?: string;
};

/** `userId` here is the internal users.id (or null for simulated/anonymous rows). */
export async function insertInteraction(e: Omit<InteractionEvent, "at" | "uid"> & { userId: string | null }) {
  await db().insert(interactions).values({
    id: newId(),
    eventId: e.eventId,
    userId: e.userId,
    kind: e.kind,
    isSimulated: e.source === "simulated",
    experimentId: e.experimentId ?? null,
    variantId: e.variantId ?? null,
    audienceId: e.audienceId ?? null,
    selectionProbability: e.selectionProbability ?? null,
    bookingId: e.reservationId ?? null,
  });
}

export async function countsByKind(eventId: string, source: Source): Promise<Partial<Record<MetricKind, number>>> {
  const rows = await db()
    .select({ kind: interactions.kind, n: sql<number>`count(*)` })
    .from(interactions)
    .where(and(eq(interactions.eventId, eventId), eq(interactions.isSimulated, source === "simulated")))
    .groupBy(interactions.kind);
  return Object.fromEntries(rows.map((r) => [r.kind, r.n]));
}

export async function logFor(eventId: string, limit = 2000): Promise<InteractionEvent[]> {
  const rows = await db().select().from(interactions).where(eq(interactions.eventId, eventId)).orderBy(asc(interactions.createdAt)).limit(limit);
  return rows.map((r) => ({
    at: r.createdAt,
    kind: r.kind,
    eventId: r.eventId,
    uid: r.userId ?? "",
    source: r.isSimulated ? "simulated" : "real",
    ...(r.experimentId ? { experimentId: r.experimentId } : {}),
    ...(r.variantId ? { variantId: r.variantId } : {}),
    ...(r.audienceId ? { audienceId: r.audienceId } : {}),
    ...(r.selectionProbability !== null ? { selectionProbability: r.selectionProbability } : {}),
    ...(r.bookingId ? { reservationId: r.bookingId } : {}),
  }));
}
