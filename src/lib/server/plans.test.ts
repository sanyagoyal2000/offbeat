import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { orderCost } from "@/lib/pricing";
import { feeRuleFor, getEvent, restaurantsIn } from "./catalog";
import { db } from "./db/client";
import { ticketTiers } from "./db/schema";
import { PlanError, myPlans, removePlan, savePlan } from "./plans";

const EVENT = "chai-and-chords-rooftop";

describe("saved individual plans", () => {
  it("recomputes prices on the server and saves one plan per session", async () => {
    const e = (await getEvent(EVENT))!;
    const s = e.sessions[0];
    const t = s.tiers[0];
    const r = (await restaurantsIn(e.cityId))[0];
    const plan = await savePlan("u_4000000000000001", { eventId: EVENT, sessionId: s.id, tierId: t.id, party: 2, dinner: { restaurantId: r.id, start: `${s.end.slice(0, 10)}T21:00` } });
    const tickets = orderCost(t.price, 2, feeRuleFor(e.cityId), e.currency).total;
    expect(plan.ticketsTotal).toBe(tickets);
    expect(plan.dinner?.estimate).toBe(r.costPerPerson * 2);
    expect(plan.total).toBe(tickets + r.costPerPerson * 2);

    // Saving the same option again updates it instead of duplicating.
    await savePlan("u_4000000000000001", { eventId: EVENT, sessionId: s.id, tierId: t.id, party: 3, dinner: null });
    const mine = await myPlans("u_4000000000000001");
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ party: 3, dinner: null, status: "upcoming", tierName: t.name });
    expect(await myPlans("u_4000000000000002")).toEqual([]);
  });

  it("rejects options that don't exist", async () => {
    await expect(savePlan("u_4000000000000001", { eventId: EVENT, sessionId: "nope", tierId: "nope", party: 1, dinner: null })).rejects.toBeInstanceOf(PlanError);
  });

  it("shows live availability and lets only the owner remove a plan", async () => {
    const e = (await getEvent(EVENT))!;
    const s = e.sessions[1];
    const t = s.tiers[0];
    await savePlan("u_4000000000000003", { eventId: EVENT, sessionId: s.id, tierId: t.id, party: 4, dinner: null });
    await db().update(ticketTiers).set({ sold: t.capacity - 2 }).where(eq(ticketTiers.id, t.id));
    const [p] = await myPlans("u_4000000000000003");
    expect(p).toMatchObject({ status: "sold-out", seatsLeft: 2 });
    await removePlan("u_4000000000000004", p.id);
    expect(await myPlans("u_4000000000000003")).toHaveLength(1);
    await removePlan("u_4000000000000003", p.id);
    expect(await myPlans("u_4000000000000003")).toEqual([]);
  });
});
