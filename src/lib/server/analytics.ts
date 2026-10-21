/**
 * First-party interaction log for organizer reporting and promotion experiments.
 * `source` keeps real visitor activity apart from labelled simulation data.
 */
import "server-only";
import { store } from "./store";

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
  /** Probability the variant had of being shown when it was selected (for interpreting results). */
  selectionProbability?: number;
  reservationId?: string;
};

const countsKey = (eventId: string, source: Source) => `metrics:${source}:${eventId}`;
const logKey = (eventId: string) => `metricslog:${eventId}`;
const MAX_LOG = 2000;

/** Increment aggregate counters and keep a bounded raw log per event. */
export async function track(e: Omit<InteractionEvent, "at">) {
  const s = store();
  await s.lock(`metrics:${e.eventId}`, async () => {
    const counts = (await s.get<Record<MetricKind, number>>(countsKey(e.eventId, e.source))) ?? ({} as Record<MetricKind, number>);
    counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    await s.set(countsKey(e.eventId, e.source), counts);
    const log = (await s.get<InteractionEvent[]>(logKey(e.eventId))) ?? [];
    log.push({ ...e, at: new Date().toISOString() });
    await s.set(logKey(e.eventId), log.slice(-MAX_LOG));
  });
}

export async function metricsFor(eventId: string, source: Source = "real") {
  return (await store().get<Partial<Record<MetricKind, number>>>(countsKey(eventId, source))) ?? {};
}

export async function interactionLog(eventId: string) {
  return (await store().get<InteractionEvent[]>(logKey(eventId))) ?? [];
}
