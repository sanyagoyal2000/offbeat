import { z } from "zod";
import { CATEGORIES } from "./categories";

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const HHMM = z.string().regex(/^\d{2}:\d{2}$/);
const Local = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
export const PlanRequestSchema = z.object({
  cityId: z.string(),
  from: Day,
  to: Day,
  earliest: HHMM.nullish(),
  latest: HHMM.nullish(),
  area: z.object({ name: z.string(), lat: z.number(), lng: z.number() }).nullish(),
  maxKm: z.number().positive().max(200).nullish(),
  budget: z.object({ amount: z.number().nonnegative().nullable(), mode: z.enum(["per-person", "total"]) }),
  party: z.number().int().min(1).max(10),
  categories: z.array(z.enum(CATEGORIES)).max(10),
  keywords: z.array(z.string().max(30)).max(6),
  dinner: z.boolean(),
  maxPerPerson: z.number().nonnegative().nullish(),
  startBefore: Local.nullish(),
  startAfter: Local.nullish(),
  excludeCategories: z.array(z.enum(CATEGORIES)).optional(),
  excludeEventIds: z.array(z.string()).max(50).optional(),
  excludeRestaurantIds: z.array(z.string()).max(50).optional(),
  pinSessionId: z.string().nullish(),
  simulatedSoldOut: z.array(z.string()).max(20).optional(),
});
