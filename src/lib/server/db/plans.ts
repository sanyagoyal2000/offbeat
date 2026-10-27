/** Saved individual plans repository (user_plans). */
import { and, desc, eq } from "drizzle-orm";
import { db, newId } from "./client";
import { fromDbAmount, toDbAmount } from "./money";
import { userPlans } from "./schema";
import { userIdFor } from "./users";

export type Dinner = { restaurantId: string; name: string; area: string; start: string; estimate: number };
export type SavedPlan = { id: string; cityId: string; eventId: string; sessionId: string; tierId: string; party: number; currency: string; ticketsTotal: number; dinner: Dinner | null; total: number; createdAt: string };

const toPlan = (r: typeof userPlans.$inferSelect): SavedPlan => ({
  id: r.id,
  cityId: r.city,
  eventId: r.eventId,
  sessionId: r.sessionId,
  tierId: r.tierId,
  party: r.party,
  currency: r.currency,
  ticketsTotal: fromDbAmount(r.ticketsTotalAmount, r.currency),
  dinner: r.dinnerJson ? (JSON.parse(r.dinnerJson) as Dinner) : null,
  total: fromDbAmount(r.totalAmount, r.currency),
  createdAt: r.createdAt,
});

export async function listPlans(cookieId: string): Promise<SavedPlan[]> {
  const userId = await userIdFor(cookieId);
  return (await db().select().from(userPlans).where(eq(userPlans.userId, userId)).orderBy(desc(userPlans.createdAt))).map(toPlan);
}

/** Saves (or updates, for the same session) a plan. */
export async function upsertPlan(cookieId: string, p: Omit<SavedPlan, "id" | "createdAt">): Promise<SavedPlan> {
  const userId = await userIdFor(cookieId);
  const row = {
    userId,
    city: p.cityId,
    eventId: p.eventId,
    sessionId: p.sessionId,
    tierId: p.tierId,
    party: p.party,
    currency: p.currency,
    ticketsTotalAmount: toDbAmount(p.ticketsTotal, p.currency),
    dinnerJson: p.dinner ? JSON.stringify(p.dinner) : null,
    totalAmount: toDbAmount(p.total, p.currency),
  };
  const [r] = await db()
    .insert(userPlans)
    .values({ id: newId(), ...row })
    .onConflictDoUpdate({ target: [userPlans.userId, userPlans.sessionId], set: { ...row, updatedAt: new Date().toISOString() } })
    .returning();
  return toPlan(r);
}

export async function deletePlan(cookieId: string, id: string) {
  const userId = await userIdFor(cookieId);
  await db().delete(userPlans).where(and(eq(userPlans.id, id), eq(userPlans.userId, userId)));
}
