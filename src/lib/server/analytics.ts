/**
 * First-party interaction log for organizer reporting and promotion experiments.
 * `source` keeps real visitor activity apart from labelled simulation data: real metrics
 * always query is_simulated = 0.
 */
import "server-only";
import * as repo from "./db/analytics";
import { userIdFor } from "./db/users";

export type MetricKind = repo.MetricKind;
export type Source = repo.Source;
export type InteractionEvent = repo.InteractionEvent;

export async function track(e: Omit<InteractionEvent, "at">) {
  const { uid, ...rest } = e;
  await repo.insertInteraction({ ...rest, userId: uid && e.source === "real" ? await userIdFor(uid) : null });
}

export const metricsFor = (eventId: string, source: Source = "real") => repo.countsByKind(eventId, source);
export const interactionLog = (eventId: string) => repo.logFor(eventId);
