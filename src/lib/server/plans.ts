/**
 * Individual plans saved from the planner. Prices are recomputed here from the event and restaurant
 * data, never taken from the browser. Guests can save plans too (they move with them on sign-up).
 */
import "server-only";
import { z } from "zod";
import { remaining, sessionAvailability, type OfferEvent } from "@/lib/events";
import { orderCost } from "@/lib/pricing";
import { nowIn } from "@/lib/tz";
import { feeRuleFor, getEvent, restaurantsIn, soldMaps } from "./catalog";
import { loadEvents } from "./db/catalog";
import * as repo from "./db/plans";

export const SavePlanSchema = z.object({
  eventId: z.string().min(1).max(80),
  sessionId: z.string().min(1).max(120),
  tierId: z.string().min(1).max(160),
  party: z.number().int().min(1).max(10),
  dinner: z.object({ restaurantId: z.string().min(1).max(80), start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/) }).nullable(),
});

export class PlanError extends Error {}

export async function savePlan(uid: string, input: z.infer<typeof SavePlanSchema>): Promise<repo.SavedPlan> {
  const e = await getEvent(input.eventId);
  const session = e?.sessions.find((s) => s.id === input.sessionId);
  const tier = session?.tiers.find((t) => t.id === input.tierId);
  if (!e || !session || !tier || e.status !== "published") throw new PlanError("That option isn't available any more.");
  const tickets = orderCost(tier.price, input.party, feeRuleFor(e.cityId), e.currency).total;
  let dinner: repo.Dinner | null = null;
  if (input.dinner) {
    const r = (await restaurantsIn(e.cityId)).find((x) => x.id === input.dinner!.restaurantId);
    if (!r) throw new PlanError("That dinner suggestion isn't available any more.");
    dinner = { restaurantId: r.id, name: r.name, area: r.area, start: input.dinner.start, estimate: r.costPerPerson * input.party };
  }
  const total = Math.round((tickets + (dinner?.estimate ?? 0)) * 100) / 100;
  return repo.upsertPlan(uid, { cityId: e.cityId, eventId: e.id, sessionId: session.id, tierId: tier.id, party: input.party, currency: e.currency, ticketsTotal: tickets, dinner, total });
}

export const removePlan = (uid: string, id: string) => repo.deletePlan(uid, id);

export type PlanStatus = "upcoming" | "past" | "sold-out" | "cancelled" | "unavailable";
export type PlanView = repo.SavedPlan & { event: OfferEvent | null; start: string | null; tierName: string | null; status: PlanStatus; seatsLeft: number | null };

/** Saved plans with live event details and availability (soonest upcoming first, past ones last). */
export async function myPlans(uid: string): Promise<PlanView[]> {
  const plans = await repo.listPlans(uid);
  const events = new Map((await loadEvents({ ids: [...new Set(plans.map((p) => p.eventId))] })).map((e) => [e.id, e]));
  const sold = await soldMaps([...events.values()]);
  const views = plans.map((p): PlanView => {
    const e = events.get(p.eventId) ?? null;
    const s = e?.sessions.find((x) => x.id === p.sessionId);
    const t = s?.tiers.find((x) => x.id === p.tierId);
    if (!e || !s || !t || e.status !== "published") return { ...p, event: e, start: s?.start ?? null, tierName: t?.name ?? null, status: "unavailable", seatsLeft: null };
    const a = sessionAvailability(s, sold[s.id] ?? {}, nowIn(e.timezone));
    const left = remaining(t, sold[s.id] ?? {});
    const status: PlanStatus = a.status === "past" ? "past" : a.status === "cancelled" ? "cancelled" : left < p.party ? "sold-out" : "upcoming";
    return { ...p, event: e, start: s.start, tierName: t.name, status, seatsLeft: left };
  });
  return views.sort((a, b) => Number(a.status === "past") - Number(b.status === "past") || (a.start ?? "").localeCompare(b.start ?? ""));
}
